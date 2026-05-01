# 桌面宠物 Tauri 原型

这是一个独立 Tauri 桌面宠物原型，不依赖商品编辑器项目，也不再连接上传、生图或 1 服务器排队通道。

## 当前形态

- 主窗口只显示“桌面宠物”和两个按钮：启用、停止。
- 内置一只英短金渐层幼猫素材。
- 每个静态动作都是一张透明 PNG。
- 走路动作拆成 8 张透明 PNG 连续帧。
- 宠物窗口透明、无边框、置顶、点击穿透。
- 宠物可在整个主显示器范围内移动。
- 每 60 分钟提醒用户休息。

## 素材位置

- 静态动作：`src/assets/pet/actions/`
- 走路帧：`src/assets/pet/walk/`
- 走路整条预留图：`src/assets/pet/walk-strip.png`

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

## macOS 说明

Tauri 透明窗口在 macOS 上需要 `macOSPrivateApi`。这个原型已经在 `src-tauri/tauri.conf.json` 中开启，适合本地验证，不适合直接上架 Mac App Store。

macOS 的 `.app` / `.dmg` 需要在 Mac 电脑或 GitHub macOS runner 上构建。

在 Mac 上进入本目录后运行：

```bash
chmod +x scripts/build-macos-dmg.sh
./scripts/build-macos-dmg.sh
```

生成结果：

- `.app`：`src-tauri/target/universal-apple-darwin/release/bundle/macos/Desktop Pet.app`
- `.dmg`：`src-tauri/target/universal-apple-darwin/release/bundle/dmg/`

也可以手动运行 `.github/workflows/build-macos.yml`，在 Actions 产物里下载 `Desktop-Pet-macOS`。
