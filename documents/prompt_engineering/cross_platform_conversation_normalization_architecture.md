# Cross-Platform Conversation Normalization Architecture

Status: Active supporting architecture note  
Audience: Runtime engineers, capture engineers, prompt engineers, domain experts

## Purpose

这份文档解释 export pipeline 在 `E0 dataset_builder` 之前依赖的上游层：**cross-platform normalization and semantic annotation**。

它回答一个经常被 export 文档默认带过的问题：
- 为什么 `E0` 在 Vesti 内部看起来是 deterministic 的
- 但在跨平台 capture / ingestion 场景里，`E0` 之前还必须有一层更早的归一化与标注

这份文档不替代 export multi-agent 文档；它负责说明 export 之前的数据准备边界。

## Architecture boundary

跨平台 conversation ingestion 应被理解成以下边界：

1. `P0 platform_normalizer`
2. `P1 semantic_annotator`
3. `E0 dataset_builder`
4. downstream export stages (`E1/E2/E3/repair`)

## `P0 platform_normalizer`

职责：
- 把不同平台的 conversation dump 归一成统一内部表示
- 尽量保持 deterministic mapping
- 显式记录来源平台与映射损失

典型任务：
- role normalization
- timestamp field normalization
- thread / message identity normalization
- tool-call envelope normalization
- attachment / artifact metadata normalization
- regenerated / edited turn flattening or linking

`P0` 的目标不是理解对话含义，而是把结构先统一。

## `P1 semantic_annotator`

职责：
- 对统一结构后的对话补充 heuristic / semantic labels
- 提前标记后续 export 会依赖的状态信号
- 输出 **structured sidecar annotation layer**

phase 1 的默认方向是：
- 以 heuristic / rule-based 标注为主
- 不把 `P1` 默认设计成 LLM stage
- 先保证可重复、可调试、可定位问题

典型标注目标：
- correction turn
- tentative decision
- confirmed decision
- unresolved cue
- artifact-bearing message
- reusable snippet cue
- question pivot / topic shift
- core-question cue

## Why `P1` uses a sidecar layer

`P1` 的输出格式在这轮文档里被明确锁定为 **structured sidecar annotation layer**，而不是：
- 散文式注释
- 描述性长文本
- 直接把标注结果写回 message content

这样设计的原因是：
- `E0/E1` 可以稳定消费结构化标注，不必二次从自然语言里解析
- 平台归一层和语义标注层不会在消息主体上互相污染
- validator 可以单独检查 annotation completeness 和 label coverage
- prompt tuning 不会替 schema / annotation 表达问题背锅

具体 shape 见：
- `export_stage_artifact_schemas.md`

## Boundary protection for `P1`

`P1` 的职责是 heuristic annotation，不是 conversation understanding agent。
这条边界需要在实现过程中主动防守：

- `P1` 可以输出 bounded labels
- `P1` 可以做有限的 aggregate signals
- `P1` 不应开始做开放式主题解释
- `P1` 不应替 `E1/E2` 做“整段对话到底在讲什么”的语义判断

换句话说，`P1` 可以说：
- 这里有 correction trace
- 这里 artifact density 偏高
- 这里 next-step cues 明显

但不应该默认扩张成：
- “这段对话整体上是在讨论架构哲学”
- “这个线程本质上属于实现复盘而不是决策探索”

一旦 `P1` 越过这条线，它就不再是 heuristic sidecar producer，而是在悄悄变成另一个 LLM stage。

## Why this is not “just part of E0”

把这些工作全部塞进 `E0` 会带来三个问题：
1. `E0` 的 deterministic 边界会被破坏
2. export 文档会假装输入天然干净，掩盖真正的 ingestion 风险
3. downstream prompt tuning 会替上游 schema 问题背锅

因此这里明确区分：
- `P0/P1` 负责让 conversation 变成“可进入 export 的内部对象”
- `E0` 负责从这些内部对象装配出 export dataset

## Relationship to AI Handoff and Knowledge Export

`AI Handoff` 和 `Knowledge Export` 虽然目标不同，但都依赖同一套 pre-`E0` 数据质量基础。

- AI Handoff 更依赖：
  - decision markers
  - unresolved cues
  - artifact-bearing messages
  - correction traces
- Knowledge Export 更依赖：
  - core-question cues
  - reusable snippet cues
  - topic pivots
  - actionability cues

这意味着：
- `P0/P1` 不等于偏向某一条 export mode
- 但 `P1 semantic_annotator` 需要足够丰富，才能同时服务 handoff 和 knowledge 两类 downstream stage

## Known architecture debt

### `P1` label set 可能随两条路径一起膨胀

当前 `P1` 仍被设计成 shared upstream annotation layer，这在阶段一是合理的。
但需要明确记录一个已知风险：

- `AI Handoff` 未来可能需要更细的 decision / unresolved trace
- `Knowledge Export` 未来可能需要更细的 reusable / narrative / recall cues

如果两条路径对 `P1` 的依赖不断细化，`P1` 的 label set 可能会持续膨胀。
这条债务当前不要求立刻解决，但需要被持续记录，避免 `P1` 在无计划状态下演变成：
- 过于宽泛的 label bag
- 或两套彼此分裂的 annotation strategies

## Current state vs target state

### Current state
- Vesti 内部线程场景下，`E0` 可以近似视为 deterministic local stage
- 跨平台 normalization / annotation 还没有 runtime 化为稳定管线
- export 文档此前默认了一个比真实系统更干净的输入前提

### Target state
- `P0/P1` 作为独立架构边界被明确记录
- 不同平台输入的损失、猜测与标注策略可被单独评估
- export prompt tuning 不再替 ingestion normalization 缺口背锅
- `P1` annotation output 可被 `E0/E1` 稳定消费

## Deliberate non-goals

这份文档明确 **不负责**：
- 规定具体的 UI capture flow
- 定义每个平台的完整 adapter 细节
- 把 `P1` 演变成另一个开放式 AI pipeline
- 替代 export composer / validator 文档

## Relationship to other docs

如果你想理解：
- AI handoff 为什么需要保真任务状态，先看：
  - `export_ai_handoff_architecture.md`
- Knowledge export 为什么需要结构化回看资产，先看：
  - `export_knowledge_export_architecture.md`
- export 后段的 bounded chain 如何组织，继续看：
  - `export_multi_agent_architecture.md`
  - `export_prompt_contract.md`
  - `export_prompt_inventory.md`
- `P1/E0/E1/E2/E3/repair` 的 artifact shape，继续看：
  - `export_stage_artifact_schemas.md`

## Working conclusion

对于跨平台 conversation ingestion 而言，真正的系统边界不是从 `E0 dataset_builder` 开始，而是从：
- `P0 platform_normalizer`
- `P1 semantic_annotator`

开始。

只有先把输入统一和标注好，`E0` 才能继续保持 deterministic，后续 `AI Handoff` 和 `Knowledge Export` 的 bounded chain 才有稳定输入面可用。
