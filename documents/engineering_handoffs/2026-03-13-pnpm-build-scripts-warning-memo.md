# 2026-03-13 pnpm build scripts 警告备忘录

## 现象
`pnpm install` 输出提示：
- Ignored build scripts: `@parcel/watcher`, `@swc/core`, `esbuild`, `lmdb`, `msgpackr-extract`, `sharp` 等
- 建议运行 `pnpm approve-builds`

## 原因
pnpm 启用了依赖构建脚本的安全防护策略：对包含 `install/postinstall` 等脚本的依赖默认不执行，除非被显式批准。

## 影响
这些包中多数是原生依赖或需要下载二进制的构建工具；若脚本被跳过，某些功能可能在本机运行时缺失或降级。当前本次构建已成功，说明现阶段未直接阻塞。

## 结论
该提示为安全告警而非构建错误；如需消除告警并确保本机环境完整，可执行 `pnpm approve-builds` 并根据提示放行必要依赖。

## 后续（可选）
1. 运行 `pnpm approve-builds`，选择需要允许的依赖。
2. 视需要执行 `pnpm rebuild` 或重新 `pnpm install` 以触发构建脚本。
