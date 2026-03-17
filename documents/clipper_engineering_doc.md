# Clipper 工程文档（clipper-try）

## 1. 目标
在不改动 main 的前提下，将 Clipper 能力集成到 clipper-try 分支，支持从会话消息中选取片段并保存为 Note。

## 2. 分支与策略
- 基线分支：main（保持不变）
- 实验分支：clipper-try（承接集成改动）
- 历史分支：codex/explore-agent-attempt（仅作为追溯参考）

## 3. 实现范围
- 在 Library Tab 增加 Clipper 视图入口
- 增加 Clipper 视图组件，支持：
  - 选择会话
  - 多选消息
  - 自动生成草稿内容
  - 保存为 Note
  - 复制草稿
  - 快捷键 Ctrl+Shift+S / Cmd+Shift+S 触发保存

## 4. 代码改动
- packages/vesti-ui/src/tabs/library-tab.tsx
  - ViewMode 扩展为 conversations | notes | clipper
  - 引入并渲染 ClipperView
  - 新增 handleClipperNoteCreated，保存后回流到 Notes
  - 新增 Clipper 入口按钮
- packages/vesti-ui/src/tabs/clipper-view.tsx
  - 新增 Clipper 主界面与交互逻辑

## 5. 构建与验证
在 packages/vesti-ui 执行 npm run build，结果通过（exit code 0）。

## 6. 已知事项
- 早期失败由 library-tab.tsx 编码异常引起（UTF-16 头导致构建报错），已修正为 UTF-8。
- 当前仅完成 UI 与存储接口层联通，后续可继续做样式与交互细化。

## 7. 后续建议
1. 在 clipper-try 分支补充交互测试（消息多选、保存、回流）
2. 与 Notes 页面联调标题/内容规则
3. 确认后再发起到 main 的 PR
