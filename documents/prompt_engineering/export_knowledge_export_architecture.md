# Export Knowledge Export (summary) Architecture

Status: Expert-facing bridge doc  
Audience: Prompt engineers, runtime engineers, domain experts, release owners

## Purpose

这是给专家沟通使用的单文档入口，用来解释 Vesti 里 **Knowledge Export (summary)** 的当前状态、真实约束和未来演进方向。

它把目前分散在多份文档里的四层信息收在一起：
- 当前已经 shipped 的运行路径
- 当前 prompt/runtime contract
- 进入实现前已经锁定的架构承诺
- 未来 export multi-agent 的目标架构

如果只看一份文档来理解 Vesti 现在如何做知识卡片式导出，以及为什么它不能退化成“松散摘要”，优先看这一份。

## Why Knowledge Export

Knowledge Export 不是 AI Handoff 的弱化版，也不是普通“摘要”。

它服务的是另一类目标：
- 让人类在未来回看时能快速恢复上下文
- 把一次技术对话沉淀成可复用的知识资产
- 让输出更适合进入 Notion / Obsidian / 内部知识库
- 把“问题定义、关键推进、可复用片段、后续动作”组织成稳定结构

Knowledge Export 的目标不是简单缩短对话，而是把一次执行性很强的对话转化为一个 **可回看、可检索、可沉淀** 的 knowledge artifact。

## Current shipped path

当前 shipped 的 Knowledge Export 路径，同样还不是完整的 multi-agent runtime，而是 bridge state。

### 已经落地的部分

现在真实运行的是：

1. `E0 dataset_builder`
   - deterministic local stage
   - 收集 selected threads、ordered messages、metadata、export mode

2. `E3 summary composer`
   - prompt-driven export composition
   - 通过当前 model/profile 路由执行
   - 外围已有 validator、diagnostics 和 deterministic local fallback

### 还没有 runtime 化的部分

这些阶段目前还没有作为独立 runtime stage 落地：
- `E1 structure_planner`
- `E2 evidence_compactor`
- 独立的 `repair` artifact contract

因此当前 shipped Knowledge Export 路径依然是：
- `E0 dataset_builder`
- 直接进入当前 summary composer
- 在输出后做 validation / diagnostics / fallback

## Current runtime contract

### Runtime source of truth

当前 runtime prompt source 仍然是：
- `frontend/src/lib/prompts/**`

`documents/prompt_engineering/**` 负责解释 contract、architecture、inventory 和 governance，但不是 runtime prompt text authority。

### Shipping headings

当前 shipping 的 **Knowledge Export (summary)** 仍然要求这些 exact headings：
- `## TL;DR`
- `## Problem Frame`
- `## Important Moves`
- `## Reusable Snippets`
- `## Next Steps`
- `## Tags`

这些 headings 同样属于 live validator contract 的一部分。

### Current model/profile routing

当前 export 路径已经是 model-profile aware 的。当前 active export profiles 是：
- `kimi_handoff_rich`
- `step_flash_concise`

虽然 profile 命名仍然更偏 handoff 语义，但目前 summary 也复用这套 profile 路由。

## Locked implementation decisions for the next phase

### 1. `E1/E2` 是 shared stage slots，但实现采用 separate prompt artifacts

这一轮文档明确锁定：
- `E1/E2` 共享 stage slot、stage names、artifact boundary、orchestration position
- `E1/E2` 不共享一套中立 prompt
- `E1/E2` 的实现采用 **separate prompt artifacts**

对于 Knowledge Export 路径，目标 prompt artifacts 是：
- `export_e1_knowledge_structure_planner`
- `export_e2_knowledge_evidence_compactor`

因此 “共享 E1/E2” 不再意味着“共享同一套 extraction logic”，而只意味着共享流程骨架和 artifact 边界。

### 2. 当前 profile routing 明确视为 bridge-state

现有 profile 命名混合了：
- model identity
- task/output intent

因此文档明确将当前 profile routing 定位为 **bridge-state**，而不是最终抽象。

未来目标拆分是双轴：
- model axis：`kimi`、`step`
- task axis：`handoff`、`knowledge`

### 3. 双轴 profile 的 phase 1 activation 先只激活 `kimi + knowledge`

为了避免双轴拆分一开始就变成四条半调优路径，这轮先锁定：
- phase 1 knowledge activation：`kimi + knowledge`
- `step + knowledge` 暂不作为 phase 1 的调优主路径

`step` 仍然保留为兼容 / fallback 基线，但不是 knowledge decomposition 第一阶段的主要调优目标。

### 4. `P0 -> P1 -> E0` 继续保留为上游边界，且 `P1` 采用 structured sidecar annotation layer

在跨平台场景下，`E0` 之前必须存在：
- `P0 platform_normalizer`
- `P1 semantic_annotator`

并且 `P1` 明确为：
- **structured sidecar annotation producer**
- 不是自然语言注释
- 不是散文式说明
- 不是直接污染标准化消息主体的内联拼接文本

## Current pain points

当前 Knowledge Export 的主矛盾，同样是 prompt-engineering stability，而不是 infra。
主要痛点包括：
- exact heading compliance 仍需更稳
- `summary` 的结构化程度和“知识卡片感”还不够强
- artifact 保留和 note readability 之间的平衡还不够理想
- 当前 profile 命名和输出目标之间还不够语义对齐

更具体地说，Knowledge Export 当前还处在：
- runtime 已经能跑
- summary contract 已经存在
- 但“知识资产化”表达仍然偏弱

## Target architecture

未来 Knowledge Export 应该和 AI Handoff 共用前段 bounded chain，但要把“共享”理解成共享阶段槽位，而不是共享同一套提示词：

0. `P0 platform_normalizer`
1. `P1 semantic_annotator`
2. `E0 dataset_builder`
3. `E1 structure_planner`
4. `E2 evidence_compactor`
5. `E3 summary composer`
6. optional `repair`

### `P0 platform_normalizer`
- upstream normalization stage
- 负责把不同平台的线程 / 消息 / role / metadata 归一成统一内部表示
- 仍以 deterministic mapping 为主

### `P1 semantic_annotator`
- heuristic / semantic labeling stage
- 输出 structured sidecar annotation layer
- 标注 summary 可能需要的重要信号，例如：
  - core question cues
  - correction turns
  - artifact markers
  - reusable snippet cues
  - implicit next steps
- 不是最终 export agent stage，但决定 `E0` 之后的知识可提炼性

### `E0 dataset_builder`
- deterministic local stage
- 从已归一、已标注的内部表示中装配 export dataset
- 为后续 stage 提供稳定输入面

### `E1 structure_planner`
- 判断这次 summary 更接近哪一类知识沉淀
- 识别：
  - core question
  - progression density
  - artifact density
  - actionability density
  - likely knowledge value
- 输出 planning notes，而不是最终笔记
- 共享 stage 槽位，但使用 knowledge 专用 prompt artifact

### `E2 evidence_compactor`
- 提炼知识资产需要的核心证据
- 提取：
  - core question
  - important moves
  - grounded snippets
  - actionable next steps
  - useful tags and reference anchors
- 输出 evidence skeleton
- 共享 stage 槽位，但使用 knowledge 专用 prompt artifact

### `E3 summary composer`
- 把 evidence skeleton 组装成 shipping summary markdown
- 强调 human recall、knowledge reuse、note readability
- 保持 profile-aware

### `repair`
- 只在 structured-output failure 之后触发
- 用于修补 summary contract 不合规的输出
- 不能演变成开放式 retry loop

## Why this should follow AI Handoff

`Knowledge Export` 应该在 `AI Handoff` 之后推进，而不是与它同时作为第一落地点。

原因不是“summary 更复杂所以晚做”，而是：
- `AI Handoff` 更容易建立 tight feedback loop
- shared upstream chain 先在 handoff 路径上验证，knowledge 路径才是真正的局部扩展
- 如果在 `P0/P1/E0/E1/E2` 还未被验证时就同步调 summary，会把两个不确定性叠在一起

因此更务实的顺序是：
1. 先跑通 `AI Handoff`
2. 再把 `Knowledge Export` 建在已验证的 shared upstream stages 之上

## Known architecture risks

### 1. 不要把 knowledge 的复杂性错误地转化成 workflow 拓扑复杂度

Knowledge Export 的难点主要在判断质量，而不是 pipeline 拓扑。
这意味着：
- 复杂性应主要消化在 `E1/E2` 的 prompt design 里
- 不应因为 summary 更主观，就引入开放式 loop 或额外 agent 自主决策

### 2. `P1` label set 与 knowledge 需求之间的长期张力

Knowledge Export 对 reusable snippets、recall quality、narrative usefulness 的依赖会逐渐变细。
如果这些需求不断前推到 `P1`，就会给 shared annotation layer 带来两种风险：
- label set 持续膨胀
- `P1` 越界去做本该由 `E1/E2` 完成的语义判断

## Deliberate non-goals

Knowledge Export 的方向明确 **不包括**：
- 直接把 summary 改成中文专用 schema 作为默认 shipping contract
- 把 summary 退化成松散摘抄
- 把 summary 做成比 compact 更空泛的“感想笔记”
- 继承 Explore 全套 session / tool taxonomy
- 把 export 变成泛化的知识管理平台壳子

Knowledge Export 应保持：
- bounded
- export-centric
- contract-driven
- note-oriented
- artifact-aware

## Relationship to AI Handoff

AI Handoff 和 Knowledge Export 共享同一条 export 主线，但承担不同角色：
- `AI Handoff (compact)`
  - 面向执行接续
  - 优先保证 task-state transfer fidelity
- `Knowledge Export (summary)`
  - 面向未来回看与知识沉淀
  - 优先保证结构化 recall 和 reusable note quality

未来它们应共享：
- `P0 platform_normalizer`
- `P1 semantic_annotator`
- `E0 dataset_builder`
- `E1 structure_planner`
- `E2 evidence_compactor`

但 `E1/E2` 的实现必须采用 separate prompt artifacts，不能假设同一套 prompt 可同时满足两类目标。

## Relationship to other docs

这份文档是 **summary / knowledge-export 方向的 first-read 入口**。看完这一份之后，再按需要进入细分 canonical docs：
- `cross_platform_conversation_normalization_architecture.md`
  - pre-`E0` 的跨平台归一化与语义标注层
- `export_stage_artifact_schemas.md`
  - `P1/E0/E1/E2/E3/repair` 的 artifact shape
- `export_workflow_runner_spec.md`
  - bounded runner、stage API calls、validator 与 repair 规则
- `export_multi_agent_architecture.md`
  - 全局 bounded-chain architecture
- `export_prompt_contract.md`
  - prompt ownership 与 stage contract
- `export_prompt_inventory.md`
  - shipped vs target runtime inventory

如果要优先理解 compact / AI 接续方向，则优先看：
- `export_ai_handoff_architecture.md`

## Working conclusion

Vesti 已经有一条真实可运行的 Knowledge Export 路径，但它目前仍然处在 bridge state：
- runtime path 已经存在
- contract 已经存在
- diagnostics 已经存在
- 真正 mode-aware 的 shared stages 还没有 runtime 化

这轮文档收口要强调的是：
- `E1/E2` 是 shared stage slots，但实现采用 separate prompt artifacts
- 当前 profile 路由只是 bridge-state，不是最终 task/model 解耦
- phase 1 先聚焦 `kimi + knowledge`
- 对跨平台场景而言，`P0/P1` pre-`E0` 层是架构必需品，而不是实现细节
