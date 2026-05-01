# 桌面宠物 Tauri 原型

这个目录是一个独立 Tauri 原型，不依赖商品编辑器项目。

## 目标

- 主窗口是干净的“桌面宠物”上传面板。
- 第二个窗口是透明、无边框、置顶的宠物窗口。
- 宠物窗口按屏幕坐标移动，因此可以跑出控制台窗口和浏览器范围。
- 默认点击穿透，不阻挡桌面、Dock、任务栏或其他应用点击。
- 客户端只上传一张宠物图片，识别宠物类型后允许用户修改，再提交到 1 服务器图片排队处理通道。

## 当前能力

- 上传 PNG / WebP / JPG 宠物图片。
- 上传后显示“识别您的宠物是 XX”，用户可以手动修改宠物类型。
- 提交原始图片到 1 服务器现有图片排队处理通道。
- 队列生成完成后，把服务器返回的透明宠物图同步到桌面宠物窗口。
- 宠物在整个主显示器范围移动。
- 桌面宠物保持小尺寸、置顶、点击穿透，并每 60 分钟提醒用户休息。

## 启动

需要本机安装 Rust/Cargo 和 Tauri 桌面开发依赖。

```powershell
npm install
npm run tauri dev
```

本机已经生成过 debug 可执行文件，也可以直接运行：

```powershell
.\run-built.ps1
```

需要开发模式热更新时运行：

```powershell
.\run-dev.ps1
```

## 1 服务器图片队列

原型通过 Tauri 后端读取密钥并调用现有通道：

- 默认地址：`https://souleye.cc/api/codex/orchestrator/v1`
- 上传接口：`https://souleye.cc/api/codex/uploads`
- 默认密钥文件：`%USERPROFILE%\Desktop\codex\.storage\generated-access-keys\latest-image-generation-keys.md`

也可以用环境变量覆盖：

- `CODEX_ORCHESTRATOR_ACCESS_KEY`
- `CODEX_ORCHESTRATOR_KEY_FILE`
- `DESKTOP_PET_QUEUE_BASE_URL`

客户端不会在前端暴露密钥。当前识别结果是轻量初始猜测，后续可以替换为服务端真实识别接口。

## macOS 说明

Tauri 透明窗口在 macOS 上需要 `macOSPrivateApi`。这个原型已经在 `src-tauri/tauri.conf.json` 中开启，适合本地验证，不适合直接上架 Mac App Store。

macOS 的 `.app` / `.dmg` 需要在 Mac 电脑上构建。Tauri 官方文档也要求用 Mac 运行打包命令。

在 Mac 上进入本目录后运行：

```bash
chmod +x scripts/build-macos-dmg.sh
./scripts/build-macos-dmg.sh
```

生成结果：

- `.app`：`src-tauri/target/universal-apple-darwin/release/bundle/macos/Desktop Pet.app`
- `.dmg`：`src-tauri/target/universal-apple-darwin/release/bundle/dmg/`

也可以把项目推到 GitHub 后，手动运行 `.github/workflows/build-macos.yml`，在 Actions 产物里下载 `Desktop-Pet-macOS`。
