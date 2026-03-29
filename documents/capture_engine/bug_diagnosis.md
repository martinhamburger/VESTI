# 捕获问题诊断

## 问题 1: Gemini 标题捕获

### 当前行为
- 使用对话开头部分作为标题
- 无法捕获原始对话标题

### 当前选择器
```typescript
title: ["[role='heading']", "main h1", "header h1", "title"]
```

### 诊断步骤
1. 打开 Gemini 对话页面
2. 在控制台运行：
```javascript
// 检查标题元素
document.querySelector("[role='heading']")?.textContent
document.querySelector("main h1")?.textContent
document.querySelector("header h1")?.textContent

// 检查所有可能的标题位置
document.querySelectorAll("h1, h2, [role='heading']").forEach(el => {
  console.log(el.textContent, el.className, el.getAttribute('data-testid'));
});
```

### 可能的修复
需要找到 Gemini 实际的标题选择器。

---

## 问题 2: Claude 捕获问题

### 症状
1. 只捕获第一个对话
2. 其余对话无法捕获
3. 标题无法正常捕获

### 可能原因
1. **选择器失效** - Claude 更新了 DOM 结构
2. **去重逻辑过激** - 误判为重复消息
3. **角色推断失败** - 无法识别用户/AI 角色

### 诊断步骤
