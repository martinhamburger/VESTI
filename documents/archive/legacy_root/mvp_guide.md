﻿﻿# Vesti MVP 功能说明书 / 使用指南

版本：v0.1
日期：2026-02-10
范围：本地优先，仅 ChatGPT + Claude 实时捕获；Gemini / DeepSeek 仅 UI 占位

---

## 1. MVP 功能概览
- **实时捕获**：在 ChatGPT / Claude 页面监听对话变化，写入本地 IndexedDB
- **Sidepanel UI**：浏览器侧边栏 Timeline + Reader
- **Insights 摘要**：ModelScope API 单会话摘要（最小可用）
- **本地存储**：不上传云端，数据完全本地化

---

## 2. 支持平台
| 平台 | 捕获支持 | UI |
| --- | --- | --- |
| ChatGPT | ✅ | ✅ |
| Claude | ✅ | ✅ |
| Gemini | ❌（UI 占位） | ✅ |
| DeepSeek | ❌（UI 占位） | ✅ |

---

## 3. 快速开始（开发版）

### 3.1 安装依赖
```bash
cd "frontend"
pnpm install
```

### 3.2 启动开发服务器
```bash
pnpm dev
```

### 3.3 加载扩展（Chrome）
1) 打开 `chrome://extensions/`
2) 开启「开发者模式」
3) 点击「加载已解压的扩展程序」
4) 选择目录：`frontend/build/chrome-mv3-dev`

---

## 4. 生产构建（交付版）
```bash
cd "frontend"
pnpm build
```

加载目录：`frontend/build/chrome-mv3-prod`

**打包交付 ZIP**：进入 `frontend/build/chrome-mv3-prod`，选中其内容（确保 `manifest.json` 在根目录），再压缩为 zip。

---

## 5. 使用指南

### 5.1 悬浮球
- 页面右下角显示悬浮球（猫头鹰 logo）
- 点击后打开 Sidepanel

### 5.2 Timeline
- 查看会话列表（按时间分组）
- 支持搜索
- 点击会话进入 Reader

### 5.3 Reader
- 浏览单个会话消息流
- 支持复制消息文本

### 5.4 Insights（摘要）
- 在 Timeline 选中会话后进入 Insights
- 若无摘要，点击「Generate」生成
- 摘要结果自动缓存

### 5.5 Settings（ModelScope）
- 填写 Model ID 与 API Key
- 点击 Test 验证连通性
- Base URL 固定为：`https://api-inference.modelscope.cn/v1/`

---

## 6. 实时刷新逻辑
- 捕获成功后，Sidepanel 自动刷新列表
- 若无变化，刷新不会触发重新渲染

---

## 7. 常见问题
**Q1：Timeline 没数据？**
- 确认当前页面是 `chatgpt.com` 或 `claude.ai`
- 发送一条新消息并等待 1-2 秒
- 打开 DevTools 查看内容脚本日志

**Q2：Sidepanel 打不开？**
- 确认扩展已加载
- 点击悬浮球触发打开
- 若失效，重载扩展后重试

**Q3：Insights 报错或无结果？**
- 检查 ModelScope API Key / Model ID 是否正确
- 在 Settings 先点 Test

---

## 8. 重要限制
- 无云同步、无多设备
- 暂不支持 Gemini / DeepSeek 的后端捕获
- 摘要为单会话，仅 MVP 版本
