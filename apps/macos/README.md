# Unofficial macOS wrapper

English | [中文](#中文)

A local WKWebView shell around the installed `dsh` CLI. It is **not** an official DeepSeek Harness product.

It launches `dsh web --no-open` and shows `http://127.0.0.1:3080` in a native window so the default browser does not open. The wrapper also:

- injects a wider transcript (`--dsh-chat-content-width` up to 1400px)
- ships a standard Edit menu so Cmd+C / Cmd+V reach the WebView

Requires Node.js and a globally installed CLI (`npm install -g @deepseek-ai/dsh`). The app looks for `dsh` on Homebrew paths and in the user's shell startup files (nvm / fnm / volta).

macOS 12+, Apple Silicon or Intel. The binary is unsigned; Gatekeeper may ask you to right-click → Open the first time, or the install script strips the quarantine flag.

## Friend install

```sh
curl -fsSL https://github.com/xl-lian/deepseek-harness/releases/download/macos-v0.1.1-rc.2/install-macos.sh | bash
```

That installs `@deepseek-ai/dsh@0.1.1-rc.2`, copies **DeepSeek Harness** into `/Applications`, and opens it.

## Build from this repo

```sh
cd apps/macos
./build.sh          # writes build/DeepSeek Harness.app
./build.sh install  # copies that bundle to /Applications
./package-release.sh  # writes the GitHub-release zip
```

---

## 中文

这是套在已安装 `dsh` CLI 外面的本地 WKWebView 外壳，**不是**官方 DeepSeek Harness 产品。

它执行 `dsh web --no-open`，在原生窗口里打开 `http://127.0.0.1:3080`，避免再弹出系统浏览器。此外会把对话区加宽，并补上标准 Edit 菜单，让 Cmd+C / Cmd+V 生效。

需要本机已安装 Node.js，以及全局 CLI（`npm install -g @deepseek-ai/dsh`）。应用会在 Homebrew 路径和用户 shell 启动脚本里查找 `dsh`（含 nvm / fnm / volta）。

要求 macOS 12+，Apple Silicon 或 Intel。二进制未做 Apple 公证；第一次打开若被拦截，请右键 → 打开。安装脚本会去掉隔离属性。

## 给朋友的一键安装

```sh
curl -fsSL https://github.com/xl-lian/deepseek-harness/releases/download/macos-v0.1.1-rc.2/install-macos.sh | bash
```

脚本会安装 `@deepseek-ai/dsh@0.1.1-rc.2`，把 **DeepSeek Harness** 放到 `/Applications` 并打开。

## 从本仓库构建

```sh
cd apps/macos
./build.sh          # 生成 build/DeepSeek Harness.app
./build.sh install  # 复制到 /Applications
./package-release.sh  # 生成 GitHub Release 用的 zip
```
