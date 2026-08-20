# Unofficial macOS wrapper

English | [中文](#中文)

A local WKWebView shell around the installed `dsh` CLI. It is **not** an official DeepSeek Harness product.

It launches `dsh web --no-open` and shows `http://127.0.0.1:3080` in a native window so the default browser does not open. The wrapper also:

- injects a wider transcript (`--dsh-chat-content-width` up to 1400px)
- ships a standard Edit menu so Cmd+C / Cmd+V reach the WebView

Requires a globally installed CLI (`npm install -g @deepseek-ai/dsh`) on `PATH`, typically `/opt/homebrew/bin/dsh`.

## Build and install

```sh
cd apps/macos
./build.sh          # writes build/DeepSeek Harness.app
./build.sh install  # copies that bundle to /Applications
```

Then open **DeepSeek Harness** from `/Applications`.

---

## 中文

这是套在已安装 `dsh` CLI 外面的本地 WKWebView 外壳，**不是**官方 DeepSeek Harness 产品。

它执行 `dsh web --no-open`，在原生窗口里打开 `http://127.0.0.1:3080`，避免再弹出系统浏览器。此外会把对话区加宽，并补上标准 Edit 菜单，让 Cmd+C / Cmd+V 生效。

需要本机已全局安装 CLI（`npm install -g @deepseek-ai/dsh`），默认查找 `/opt/homebrew/bin/dsh`。
