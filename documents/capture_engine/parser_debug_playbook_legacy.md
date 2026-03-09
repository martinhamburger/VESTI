# Claude / ChatGPT / Doubao Parser 排查复盘与可复用 SOP

版本: v1.1
更新日期: 2026-02-23
适用范围: Vesti 浏览器扩展（Local-First）

---

## 1. 背景与症状快照

在 Claude 解析链路中出现了高优先级故障（High）：

- `roleDistribution` 常见异常为 `user:3, ai:0/1`
- Sidepanel 中出现连续 `You`，问答错位
- AI 回复缺失或只捕获到部分内容
- 同一条用户输入重复写入多次
- 旧会话在多次手动保存后污染加剧

该问题会直接破坏会话上下文完整性，影响 Reader、Insights 以及后续统计分析。

---

## 2. 关键发现（本次实战）

1) **Claude DOM 存在结构漂移（A/B Test 或灰度差异）**
- User 节点仍常见 `data-testid="user-message"`
- Assistant 节点可能无稳定 `data-testid` / class（classless）
- 仅依赖 assistant selector 会高概率漏抓

2) **Reasoning UI 污染正文**
- AI 回复可能带 `Thought for Ns` / `Show more` / `Done` 等 UI 文本
- 直接提取 `innerText` 会把非正文写入数据库

3) **“只靠 selector 精准命中”不够稳**
- 需要 `Anchor & Exclusion` 作为主路径
- Selector strategy 作为 fallback，而非唯一策略

4) **仅基于 `message_count` 的增量写入不可恢复脏数据**
- 当 parser 暂时错抓后，后续保存会继续放大错位
- 需要签名比对（role + normalized text）并支持替换策略

---

## 3. 根因模型（RCA）

- **RC1: assistant 选择器失效**
  - class/testid 不稳定或缺失导致 AI 节点漏检。

- **RC2: reasoning 文本污染**
  - `Thought for Ns` 等 UI 片段被误当消息正文写库。

- **RC3: 容器级抓取混淆角色**
  - 混合容器中 user/ai 子树共存，若未拆分会统一误判。

- **RC4: 存储层仅 count 差分**
  - count 增量模型无法修复历史错位，导致重复与顺序异常持续。

---

## 4. 标准排查流程（SOP）

### Step 0: 环境隔离（必须）

- 在 `chrome://extensions/` 只保留一个 Vesti 实例
- 关闭同类扩展，避免双注入日志干扰
- 刷新目标会话页面后再采样

### Step 1: 采样（先取证，后改代码）

按固定采样脚本获取：
- selector probe（命中率）
- testid histogram（结构分布）
- anchor chain（祖先链）
- top vs iframe（渲染上下文）

### Step 2: 判因

优先判定三件事：
- assistant 节点是否有稳定标识？
- 是否混入 reasoning 文本？
- 当前抓取策略是漏抓还是误抓？

### Step 3: 修 parser

推荐顺序：
1. role-first selector path
2. anchor + exclusion 主路径
3. copy-action 反推 AI 容器（当 assistant 标识缺失）
4. 文本清洗（Thought / Show more / Done）
5. 近邻重复去重

### Step 4: 验存储

- 对比 `incoming signatures` 与 `stored signatures`
- 一致则跳过写入
- 不一致时可选整段替换（同 uuid）以修复旧污染

### Step 5: 验收

检查以下指标：
- 角色分布是否合理（非单边）
- 消息顺序是否与页面一致
- 无明显重复
- AI 正文完整，污染文本被清洗

---

## 5. 采样脚本库（可直接复制）

### 5.1 DOM selector probe

```js
(() => {
  const selectors = [
    "[data-author]",
    "[data-message-author-role]",
    "[data-testid*='user-message']",
    "[data-testid*='assistant-message']",
    "[data-testid*='message-content']",
    "main article",
    "main [role='listitem']",
    ".markdown",
    ".prose"
  ]

  const pick = (el) => ({
    tag: el.tagName.toLowerCase(),
    testid: el.getAttribute("data-testid"),
    author: el.getAttribute("data-author"),
    authorRole: el.getAttribute("data-message-author-role"),
    cls: (el.className || "").toString().split(/\s+/).slice(0, 6).join(" "),
    text: (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 140)
  })

  const out = {}
  for (const s of selectors) {
    out[s] = Array.from(document.querySelectorAll(s)).slice(0, 12).map(pick)
  }

  console.log("VESTI_DOM_DUMP", out)
  copy(JSON.stringify(out, null, 2))
})()
```

### 5.2 testid histogram

```js
(() => {
  const counts = {}
  document.querySelectorAll("[data-testid]").forEach((el) => {
    const key = el.getAttribute("data-testid") || ""
    counts[key] = (counts[key] || 0) + 1
  })

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 120)
  console.log("VESTI_TESTID_COUNTS", sorted)
  copy(JSON.stringify(sorted, null, 2))
})()
```

### 5.3 anchor chain dump（先确认 `$0` 选中的是消息节点）

```js
(() => {
  const chain = []
  let cur = $0
  for (let i = 0; i < 12 && cur; i++) {
    chain.push({
      tag: cur.tagName?.toLowerCase(),
      testid: cur.getAttribute?.("data-testid"),
      author: cur.getAttribute?.("data-author"),
      authorRole: cur.getAttribute?.("data-message-author-role"),
      cls: (cur.className || "").toString().slice(0, 140)
    })
    cur = cur.parentElement
  }
  console.log("VESTI_NODE_CHAIN", chain)
  copy(JSON.stringify(chain, null, 2))
})()
```

### 5.4 top vs iframe 内容定位

```js
(() => {
  const probe = "Thought for"
  const inTop = document.body.innerText.includes(probe)

  const frames = [...document.querySelectorAll("iframe")].map((f, i) => {
    let contains = null
    try {
      contains = !!f.contentDocument?.body?.innerText?.includes(probe)
    } catch {
      contains = "cross-origin"
    }
    return { i, src: f.src, contains }
  })

  const out = { inTop, frames }
  console.log("VESTI_LOCATE", out)
  copy(JSON.stringify(out, null, 2))
})()
```

---

## 6. 修复策略矩阵

| Strategy | 触发条件 | 核心思路 | 风险 | 推荐级别 |
| --- | --- | --- | --- | --- |
| A. Role Selector | testid/author 稳定 | 直接命中 user/assistant 节点 | A/B 变化易失效 | 中 |
| B. Anchor & Exclusion | assistant 标识缺失 | 以 user 为锚点，遍历容器子节点，非 user 且有效内容判 ai | 容器选错会混入噪音 | 高（主路径） |
| C. Copy-action Reverse | assistant classless，但 action bar 稳定 | 从 `action-bar-copy` 反推 AI 气泡容器 | 需防止错抓输入区 | 高（兜底） |
| D. Signature Replace | 出现历史脏数据/重复 | role+text 签名比对，不一致时整段替换 | 写放大，需要事务保护 | 高 |

---

## 7. 可观测性与告警阈值

Parser 每次输出固定字段：
- `totalCandidates`
- `keptMessages`
- `roleDistribution`
- `droppedUnknownRole`
- `droppedNoise`
- `source`（anchor / selector）

建议告警阈值：
- `keptMessages > 0` 且 `roleDistribution` 单边 -> warning
- `keptMessages` 与页面可见气泡差距 > 2 -> warning
- 最近 3 次保存 role 分布持续失衡 -> escalate

---

## 8. 验收标准（Acceptance Criteria）

### Case A: Thought 清洗
- 输入包含 `Thought for Ns` 的 AI 回复
- 结果中正文不包含该前缀

### Case B: 轮次对齐
- 页面可见 `U-A-U-A` 四条
- 解析结果长度与顺序与页面一致

### Case C: 角色准确
- 不出现“连续多条 user 且缺 AI”
- 非特殊场景下，`user/ai` 分布应接近对称

### Case D: 存储幂等
- 连续点击手动保存不应重复插入相同消息
- 旧会话发生策略修复后可被替换校正

---

## 8.1 Doubao CoT + 正式输出双分支 DOM（专项）

典型结构（同一 assistant turn 内并列子树）：
- 分支 A: 折叠思考区（常见 `collapse-wrapper*`）
- 分支 B: 正式 Markdown 区（常见 `flow-markdown-body` / `container-*-flow-markdown-body`）
- 夹层噪声: 检索挂件、编辑历史、页码器、引用数量卡片

推荐诊断顺序：
1. 先确认是否存在 CoT/正式输出并列子树，而不是串行单根。
2. 检查 parser 是否执行“分段提取 + 局部失败隔离”：
   - CoT 分支失败不应阻断正式输出分支。
   - 正式输出有效时必须优先入库。
3. 检查落库结构是否为单条 `ai` 消息，且包含分段标题：
   - `思考过程`
   - `正式回答`
4. 检查 `Doubao parse stats.ai_segment_stats`：
   - `cot_detected`
   - `final_detected`
   - `cot_parse_failed`
   - `final_parse_failed`
   - `final_only_fallback_used`

Doubao 本轮噪声规则（行级）：
- `^\d+\s*/\s*\d+$`（页码）
- `^(编辑历史|历史版本)$`
- `^(references?|参考链接|引用)\s*[:：]?\s*\d+$`
- `^(展开|收起|show more|done|copy|edit|retry)$`
- `^(找到|检索到)\s*\d+\s*篇?.*(资料|参考|结果).*$`

---

## 9. 人机协作 SOP（重点）

### 9.1 角色分工
- **用户**: 在真实页面执行采样脚本，提供日志、截图、现象描述。
- **Agent**: 基于证据做根因归类，给出最小风险修复方案与验证步骤。

### 9.2 每轮固定交付模板
每轮最少包含：
1. 当前症状一句话
2. 一条最新 parser stats
3. 一份 DOM dump / testid histogram
4. 一张截图（可选但强烈建议）

### 9.3 禁止事项
- 只报“现象”不报“采样”
- 同时启用多个同类扩展
- 不清环境连续验证导致结果污染
- 未标注“是否新会话”就对比旧数据

### 9.4 一轮一结论节奏
- 第 1 轮：定位问题类型（漏抓/误抓/存储污染）
- 第 2 轮：最小改动修复
- 第 3 轮：回归验证与收敛

---

## 10. 后续开发建议

1) **Parser 抽象升级**
- 为每个平台实现双策略引擎（selector + anchor）
- 输出统一 `ParseReport`，便于自动比较策略质量

2) **数据层幂等策略**
- 继续沿用 signature compare + transactional replace
- 增加会话级版本号，支持差分回滚

3) **DOM Contract 回归机制**
- 固化关键采样脚本
- 每次发布前进行 smoke check（ChatGPT/Claude 各 1 会话）

4) **人机协作标准化**
- 将本 playbook 作为默认排查模板
- 新增 issue 模板要求附带 parser stats + dump

---

## 附录 A: 快速故障分流

- `user: N, ai: 0` -> 优先检查 assistant 标识是否缺失，启用 anchor strategy
- 消息重复 -> 优先检查存储签名比对与替换路径
- AI 文本包含 `Thought for` -> 检查清洗 regex 是否命中
- 顺序错乱 -> 检查容器选择与消息排序逻辑
