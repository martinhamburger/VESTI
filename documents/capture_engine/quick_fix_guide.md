# 捕获问题修复指南

## 问题 1: Gemini 标题捕获

### 诊断命令
在 Gemini 页面控制台运行：
```javascript
// 查找标题元素
console.log('1:', document.querySelector("[role='heading']")?.textContent);
console.log('2:', document.querySelector("main h1")?.textContent);
console.log('3:', document.title);
```

### 临时修复
如果上述都无效，需要添加更多选择器。

---

## 问题 2: Claude 只捕获第一条消息

### 诊断命令
```javascript
// 检查消息数量
const msgs = document.querySelectorAll('[data-testid*="message"]');
console.log('消息总数:', msgs.length);

// 检查角色
msgs.forEach((m, i) => {
  console.log(i, m.getAttribute('data-testid'));
});
```

### 可能原因
1. 去重逻辑误判
2. 角色识别失败
3. 选择器不匹配

请在实际页面运行诊断命令，并将结果反馈给我。
