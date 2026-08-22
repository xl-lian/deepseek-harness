import Cocoa
import WebKit

/// WKWebView does not receive Cmd+C/V/X/A unless an Edit menu exists and the
/// view itself claims those key equivalents from the responder chain.
final class DesktopWebView: WKWebView {
    override var acceptsFirstResponder: Bool { true }

    override func performKeyEquivalent(with event: NSEvent) -> Bool {
        guard event.type == .keyDown,
              event.modifierFlags.contains(.command),
              let key = event.charactersIgnoringModifiers?.lowercased()
        else {
            return super.performKeyEquivalent(with: event)
        }
        let action: Selector
        switch key {
        case "c":
            action = #selector(NSText.copy(_:))
        case "v":
            action = #selector(NSText.paste(_:))
        case "x":
            action = #selector(NSText.cut(_:))
        case "a":
            action = #selector(NSText.selectAll(_:))
        case "z":
            action = event.modifierFlags.contains(.shift)
                ? Selector(("redo:"))
                : Selector(("undo:"))
        default:
            return super.performKeyEquivalent(with: event)
        }
        return NSApp.sendAction(action, to: nil, from: self) || super.performKeyEquivalent(with: event)
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var window: NSWindow!
    private var webView: DesktopWebView!
    private var serverProcess: Process?
    private let serverURL = URL(string: "http://127.0.0.1:3080")!
    private var startupTimer: Timer?
    private var readyChecks = 0

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()
        buildWindow()

        if serverIsAlreadyUp() {
            loadServer()
        } else if let error = startServer() {
            fatalAlert("Failed to start the dsh server", detail: error)
        } else {
            pollForServer()
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    func applicationWillTerminate(_ notification: Notification) {
        stopServer()
    }

    // Widen the transcript past the shipped 748px content cap. Hashes on
    // CSS-module class names change per build; data-phase is stable.
    private static let wideChatScript = """
    (function () {
      var id = 'dsh-desktop-wide-chat';
      if (document.getElementById(id)) return;
      var style = document.createElement('style');
      style.id = id;
      style.textContent = [
        '[data-phase="active"],',
        '[data-phase="hero"],',
        '[data-phase="settling"] {',
        '  --dsh-chat-content-width: min(1400px, calc(100% - 40px)) !important;',
        '}'
      ].join('\\n');
      (document.head || document.documentElement).appendChild(style);
    })();
    """

    // MARK: - UI

    private func buildWindow() {
        let rect = NSRect(x: 0, y: 0, width: 1280, height: 840)
        window = NSWindow(
            contentRect: rect,
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "DeepSeek Harness"
        window.minSize = NSSize(width: 900, height: 600)
        window.center()

        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.userContentController.addUserScript(WKUserScript(
            source: Self.wideChatScript,
            injectionTime: .atDocumentEnd,
            forMainFrameOnly: true
        ))
        webView = DesktopWebView(frame: rect, configuration: config)
        webView.navigationDelegate = self
        window.contentView = webView
        window.makeKeyAndOrderFront(nil)
        window.makeFirstResponder(webView)
        NSApp.activate(ignoringOtherApps: true)
    }

    private func buildMenu() {
        let mainMenu = NSMenu()
        let name = ProcessInfo.processInfo.processName

        let appItem = NSMenuItem()
        mainMenu.addItem(appItem)
        let appMenu = NSMenu()
        appMenu.addItem(
            withTitle: "About \(name)",
            action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)),
            keyEquivalent: ""
        )
        appMenu.addItem(.separator())
        appMenu.addItem(
            withTitle: "Hide \(name)",
            action: #selector(NSApplication.hide(_:)),
            keyEquivalent: "h"
        )
        let hideOthers = NSMenuItem(
            title: "Hide Others",
            action: #selector(NSApplication.hideOtherApplications(_:)),
            keyEquivalent: "h"
        )
        hideOthers.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(hideOthers)
        appMenu.addItem(
            withTitle: "Show All",
            action: #selector(NSApplication.unhideAllApplications(_:)),
            keyEquivalent: ""
        )
        appMenu.addItem(.separator())
        appMenu.addItem(
            withTitle: "Quit \(name)",
            action: #selector(NSApplication.terminate(_:)),
            keyEquivalent: "q"
        )
        appItem.submenu = appMenu

        let editItem = NSMenuItem()
        mainMenu.addItem(editItem)
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        let redo = NSMenuItem(title: "Redo", action: Selector(("redo:")), keyEquivalent: "z")
        redo.keyEquivalentModifierMask = [.command, .shift]
        editMenu.addItem(redo)
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = editMenu

        NSApp.mainMenu = mainMenu
    }

    // MARK: - dsh server lifecycle

    private func locateDSH() -> String? {
        var candidates: [String] = []
        if let override = ProcessInfo.processInfo.environment["DSH_BIN"] {
            candidates.append(override)
        }
        candidates.append(contentsOf: [
            "/opt/homebrew/bin/dsh",
            "/usr/local/bin/dsh",
            "/usr/bin/dsh",
        ])
        if let fromShell = commandFromUserShell("command -v dsh") {
            candidates.append(fromShell)
        }

        var seen = Set<String>()
        for path in candidates where seen.insert(path).inserted {
            if FileManager.default.isExecutableFile(atPath: path) {
                return path
            }
        }
        return nil
    }

    /// GUI apps get a tiny PATH. Source the user's shell startup files so
    /// Homebrew, nvm, fnm, and volta installs of `dsh` are visible.
    private func commandFromUserShell(_ command: String) -> String? {
        let script = """
        [ -f "$HOME/.zprofile" ] && . "$HOME/.zprofile"
        [ -f "$HOME/.zshrc" ] && . "$HOME/.zshrc"
        [ -f "$HOME/.bash_profile" ] && . "$HOME/.bash_profile"
        [ -f "$HOME/.bashrc" ] && . "$HOME/.bashrc"
        [ -f "$HOME/.profile" ] && . "$HOME/.profile"
        \(command)
        """
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/zsh")
        process.arguments = ["-c", script]
        let stdout = Pipe()
        process.standardOutput = stdout
        process.standardError = FileHandle.nullDevice
        do {
            try process.run()
            process.waitUntilExit()
        } catch {
            return nil
        }
        guard process.terminationStatus == 0 else { return nil }
        let text = String(data: stdout.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return text.isEmpty ? nil : text
    }

    private func startServer() -> String? {
        guard let dsh = locateDSH() else {
            return "The dsh CLI was not found. Install it with:\nnpm install -g @deepseek-ai/dsh"
        }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: dsh)
        process.arguments = ["web", "--no-open"]

        var env = ProcessInfo.processInfo.environment
        let defaultPath = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        env["PATH"] = defaultPath + (env["PATH"].map { ":" + $0 } ?? "")
        process.environment = env
        process.currentDirectoryURL = FileManager.default.homeDirectoryForCurrentUser

        do {
            try process.run()
            serverProcess = process
            return nil
        } catch {
            return error.localizedDescription
        }
    }

    private func stopServer() {
        guard let process = serverProcess, process.isRunning else { return }
        process.terminate()
        DispatchQueue.global().asyncAfter(deadline: .now() + 2) { [weak process] in
            if process?.isRunning == true {
                process?.interrupt()
            }
        }
    }

    private func serverIsAlreadyUp() -> Bool {
        var request = URLRequest(url: serverURL)
        request.timeoutInterval = 1
        let semaphore = DispatchSemaphore(value: 0)
        var isUp = false
        URLSession.shared.dataTask(with: request) { _, response, _ in
            if let http = response as? HTTPURLResponse, http.statusCode == 200 {
                isUp = true
            }
            semaphore.signal()
        }.resume()
        _ = semaphore.wait(timeout: .now() + 1.5)
        return isUp
    }

    private func pollForServer() {
        readyChecks = 0
        startupTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] timer in
            guard let self = self else {
                timer.invalidate()
                return
            }
            if self.serverIsAlreadyUp() {
                timer.invalidate()
                self.loadServer()
            } else {
                self.readyChecks += 1
                if self.readyChecks > 180 { // 90 seconds
                    timer.invalidate()
                    self.fatalAlert(
                        "The dsh server did not start in time",
                        detail: "Try launching it manually with:\ndsh web --no-open"
                    )
                }
            }
        }
    }

    private func loadServer() {
        webView.load(URLRequest(url: serverURL))
    }

    private func injectWideChat() {
        webView.evaluateJavaScript(Self.wideChatScript, completionHandler: nil)
    }

    private func fatalAlert(_ message: String, detail: String) {
        let alert = NSAlert()
        alert.messageText = message
        alert.informativeText = detail
        alert.alertStyle = .critical
        alert.runModal()
        NSApp.terminate(nil)
    }
}

extension AppDelegate: WKNavigationDelegate {
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        injectWideChat()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code != NSURLErrorCancelled {
            fatalAlert("Could not load the dsh web UI", detail: error.localizedDescription)
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code != NSURLErrorCancelled {
            fatalAlert("Could not load the dsh web UI", detail: error.localizedDescription)
        }
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
