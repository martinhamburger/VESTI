# Capture Engine Operational Playbook

Status: Active operational playbook  
Audience: Parser maintainers, QA, release owners, engineers doing DOM sampling or capture bug triage

## 1. Purpose

本文档是 capture engine 的唯一操作文档，整合旧版 debugging playbook、manual sampling standard 与 legacy parser SOP 中仍然有效的部分。

使用它来统一：
- DOM 采样
- root-cause 分类
- 证据包结构
- QA / sampling matrix
- release gate

## 2. Standard Debug and Validation Flow

固定使用以下 5 步：

1. 环境隔离
   - 锁定平台、线程、治理模式、是否冷启动、是否正在生成。
2. 结构化采样
   - 先取 DOM、截图、decision log、reader / export 结果，再决定是否改代码。
3. fault classification
   - 先判断问题属于 parser、normalization、shared extraction、reader、export、compression 还是 governance。
4. 最小修复范围
   - 一次只修一个 root-cause bucket，不把 parser、reader、治理混成一包。
5. 回归验证
   - 原 case 回归通过后，再补同平台相邻 case 与跨平台抽样。

## 3. DOM Sampling Template

每个 case 至少采以下信息：

| 字段 | 必填内容 |
| --- | --- |
| URL / session id 来源 | path、query、DOM attribute 中哪个字段是真正稳定的 conversation identity |
| conversation root | 整个线程的最小稳定根 |
| turn root | 单条 user / assistant turn 的最小外层容器 |
| content root | 实际承载正文的最小内容节点 |
| role root | 区分 user / assistant 的属性、testid、class、aria 线索 |
| generating 标记 | 页面正在生成时的 DOM 状态与可观察标记 |
| noise nodes | toolbar、copy、retry、pagination、header、search card、引用统计等 |
| rich nodes | code、math、table、task-list、citation pill、image、artifact、preview、download card |
| screenshot | 至少 1 张可对照 reader 结果的截图 |
| minimal outerHTML | 最小可复现 DOM 片段，而不是整个页面导出 |

补充规则：
- 不要只记 selector，必须同时留视觉证据。
- 不要只采“正在生成”的瞬时状态，要补“历史线程冷打开”。
- 多模态 case 必须单独建样本，不能混在普通文本 case 里。

### 3.1 Math Formula Sampling Notes

数学公式 case 额外记录以下平台分流：

| platform family | 优先信号 | 处理要求 |
| --- | --- | --- |
| `ChatGPT / Claude / Qwen / DeepSeek` | `.katex-mathml annotation[encoding="application/x-tex"]` | 优先走 annotation 语义层；仅在明显整体双转义时收敛反斜杠 |
| `Gemini` | `[data-math]` | 以属性态公式源为主；旧 `data-formula` 只作为兼容 fallback |
| `Doubao` | `[data-custom-copy-text]` | 只去定界符 `\\(...\\)` / `\\[...\\]`，不做全局双反斜杠收敛 |
| `Kimi / Yuanbao` | DOM 无稳定公式源 | 记录为 deferred fallback track，转向 copy-full-markdown / network interception / shadow-state evidence |

附加采样要求：
- 至少分别采 inline 与 block math。
- 含 table / paragraph / list 的混排公式必须单独留样，防止整段被误提升为 `math`。
- 复制验证必须记录“复制结果是否为 raw TeX”，而不是只看 reader 视觉渲染。
- 需要同时记录 `content_text` 是否已被多层公式 DOM 污染，而不是只记录 reader 外观。
- 对旧记录回归时，要区分：
  - `已有 AST math，可由 repair migration 修复 canonical text`
  - `没有 AST，必须重新打开原线程并 recapture`

## 4. Fault Taxonomy

统一使用以下 fault taxonomy：

| fault code | 定义 |
| --- | --- |
| `parser_miss` | parser 没找到消息、角色、会话或 candidate 根 |
| `structure_collapse` | 找到了消息，但正文边界塌缩、合并、串位或丢层级 |
| `editor_virtualization` | 复杂 editor / viewer 导致直接文本提取失真 |
| `semantic_extractor_misclassification` | shared extractor 误判 block / inline / semantic root |
| `missing_attachment_or_artifact` | 图片、附件、artifact、下载物存在，但 capture 结果没有保留存在性 |
| `missing_citation_or_link_target` | citation / link 存在，但 href、label 或来源缺失 |
| `reader_render_gap` | capture 已有结构，但 reader 未正确保真显示 |
| `export_fidelity_gap` | reader 还行，但 JSON / MD / TXT 导出丢失信息 |
| `compression_input_gap` | 压缩输入仍然只看纯文本，导致结构化信息未进入上下文 |

## 5. QA and Sampling Matrix

每个平台至少覆盖以下样本：

| case type | 最低要求 |
| --- | --- |
| plain text | user / assistant 轮次、角色、正文完整 |
| code block | 代码语言、行结构、viewer 壳层不污染正文 |
| math | 公式至少保留存在性与可阅读表达 |
| table | 行列结构不塌缩成一段纯文本 |
| heading / list / task-list | 层级、编号、checkbox 状态保留 |
| citation / link pill | label 与 link target 至少保留存在性 |
| uploaded image | 至少保留数量、来源、所在消息与可见元数据 |
| generated image | 至少保留数量、来源、所在消息与可见元数据 |
| artifact / preview / downloadable output | 至少保留标题、容器类型、下载或预览存在性 |
| history cold-open warm-start case | 无新 mutation 时仍能验证 transient / manual capture 可用性 |

推荐优先顺序：
1. GPT rich-text + multimodal
2. Doubao CoT / final answer + 引用 / 搜索卡
3. ChatGPT / Qwen normalization 回归
4. DeepSeek / Gemini 脆弱 case

## 6. Evidence Package Requirements

每轮修复或验证都应提交完整证据包：

- parser stats
- capture decision log
- DOM snippet
- screenshot
- reader result
- export result
- compression input / result（相关时必须提供）

建议命名字段：
- `case_id`
- `platform`
- `conversation_type`
- `fault_code`
- `before`
- `after`

## 7. Release Gate

当前 release gate 只保留仍有效的统一口径，不再按旧 `phase1 / phase2 / phase3` 维护分裂 checklist。

发布前至少确认：
- capture governance 没有回归
- 新平台或改动平台通过基础 sampling matrix
- rich-text case 没有结构塌缩
- multimodal case 至少保留存在性
- reader / export / compression 没有明显断层
- 历史线程冷打开时，manual capture 不因缺少新 mutation 而完全失效

## 8. Practical Notes for the Next Refactor Cycle

- DOM 采样的目标不是继续堆 selector，而是为 `platform normalization` 提供证据。
- 一旦发现 attachment / artifact / citation 只能以文本形式存在，也要先把“存在性保留”记入缺口，不要假装问题已解决。
- parser 修复和 reader 修复必须成对抽样，否则容易把 capture 问题误诊成 UI 问题，反之亦然。

## 9. Historical Lineage

本 playbook 整合自以下历史资料：
- `capture_debugging_playbook.md`
- `manual_sampling_and_acceptance.md`
- `parser_debug_playbook_legacy.md`

上述文件已归档保留，但不再维护为当前操作入口。
