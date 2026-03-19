# Export Workflow Runner Specification

Status: Active canonical execution note  
Audience: Runtime engineers, prompt engineers, evaluator authors

## Purpose

这份文档定义 export bounded chain 在 phase 1 的推荐执行方式。

目标不是给出某个框架偏好，而是写死这些实现前必须成立的约束：
- workflow 是 bounded chain / pipeline orchestrator
- 不是 agentic loop
- validator 在每个关键 stage 之后立即挂载
- `repair` 是异常路径，不是常规循环

## Workflow classification

当前 export workflow 应被视为：
- 有向无环的 bounded chain
- 输入输出边界预先定义好的 pipeline
- 非开放式 agent runtime

因此当前更需要的是：
- 轻量 pipeline runner
- 显式 artifact objects
- 独立 stage API calls
- stage-level validation

而不是：
- 开放式 agent loop
- 动态 tool arbitration
- graph framework 驱动的自治控制流

## Framework position

这轮文档明确：
- 当前阶段 **不默认引入 LangChain / LangGraph**
- 当前默认方向是轻量 in-process runner
- 每个 stage 作为显式函数或模块执行
- stage 之间通过显式 artifact 传递数据

只有当后续真的出现以下需求时，才重新评估 graph framework：
- runtime 条件分支显著增多
- stage 间需要并发协同
- tool-calling autonomy 成为主路径需求
- repair 不再是 bounded exception path

## Phase 1 execution model

phase 1 runner 的标准链路是：

1. `P0 platform_normalizer`
2. `P1 semantic_annotator`
3. `E0 dataset_builder`
4. `E1 structure_planner`
5. `E2 evidence_compactor`
6. `E3 export_composer`
7. optional `repair`

### API-call policy

- `P0`: no LLM API call
- `P1`: phase 1 默认 no LLM API call
- `E0`: no LLM API call
- `E1`: exactly one LLM API call
- `E2`: exactly one LLM API call
- `E3`: exactly one LLM API call
- `repair`: optional one extra LLM API call only after final contract failure

## Stage execution rules

### `P0 platform_normalizer`
- deterministic structural normalization
- validator: shape-level normalization checks
- failure policy: hard fail, no downstream execution

### `P1 semantic_annotator`
- heuristic / rule-based semantic annotation in phase 1
- output must match the structured sidecar schema
- validator: annotation envelope shape + minimum label coverage
- failure policy: hard fail, no downstream execution

### `E0 dataset_builder`
- deterministic assembly from normalized conversation + annotation sidecar
- validator: dataset shape, message ordering, mode + locale presence
- failure policy: hard fail, no downstream execution

### `E1 structure_planner`
- one independent API call
- input: `E0` dataset artifact
- mode passed explicitly as `handoff` or `knowledge`
- validator runs immediately after completion
- failure policy: stop pipeline, do not spend downstream API calls

### `E2 evidence_compactor`
- one independent API call
- input: validated `E1` planning notes
- mode passed explicitly
- validator runs immediately after completion
- failure policy: stop pipeline, do not spend downstream API calls

### `E3 export_composer`
- one independent API call
- input: validated `E2` evidence skeleton
- mode passed explicitly
- final contract validator runs immediately after completion
- if valid: finish successfully
- if invalid: enter bounded `repair`

### `repair`
- optional one-shot exception path
- input: failed output + invalid reasons + expected headings + upstream artifact id
- one independent API call
- validator runs again after repair
- if still invalid: return degraded failure / deterministic fallback
- repair must not recurse
- implementation should enforce `maxRepairAttempts = 1`
- `repair` must not reopen `E2` extraction or trigger any upstream feedback loop

## Stateless call rule

每个 LLM stage 必须是独立 API call，而不是把多个 stage 拼进同一个长对话上下文里。

原因：
- 便于独立 validation
- 便于定位哪个 stage 失稳
- 便于后续局部替换某个 stage prompt
- 避免一个 stage 的错误污染下一个 stage 的上下文

## Validation placement

validator 的基本原则是：
- 在每个关键 stage 之后立即运行
- 不等整条链路跑完再做总检查

最少需要：
- `validate_p0_output`
- `validate_p1_output`
- `validate_e0_output`
- `validate_e1_output`
- `validate_e2_output`
- `validate_final_export`

## Phase 1 activation strategy

双轴 profile 的 phase 1 activation 先锁定为：
- `kimi + handoff`
- `kimi + knowledge`

这意味着：
- `E1/E2/E3` 的主调优路径先围绕 Kimi 建立
- `step` 作为兼容 / fallback 路线保留，但不在 phase 1 承担 task-specific tuning 主责

## Delivery sequencing

在 phase 1 的实际落地顺序上，优先级固定为：
1. 先跑通 `AI Handoff`
2. 再扩展 `Knowledge Export`

原因不是“先做简单的”，而是：
- `AI Handoff` 更容易建立 tight feedback loop
- downstream agent 是否尊重已有 decisions / constraints / unresolved work，可以更快操作化评估
- 共享的 `P0/P1/E0/E1/E2` 一旦先在 handoff 路径上验证过，knowledge 路径才是基于已验证前段的局部扩展

## Known execution risks

### 1. bounded 约束被质量优化悄悄侵蚀

最需要主动防守的风险不是模型能力，而是 workflow 在“修质量”的名义下重新长出 loop：
- 让 `E3` 反向驱动 `E2` 重提取
- 让 `repair` 不断 retry 直到满意
- 让 stage 在运行时动态改写下一步拓扑

这些都与本文件定义的 bounded chain 基线冲突。

### 2. `repair` 必须是硬边界，不只是文档口头约束

`repair` 之所以存在，是为了修补 final contract failure，而不是把 export runner 变成开放式自修复树。
因此 phase 1 实现必须在代码层面直接保证：
- one-shot only
- no recursive repair
- no upstream stage reopening

### 3. phase 1 不把 framework complexity 当成质量补偿

当前阶段最主要的不稳定性仍然来自 prompt / artifact / validator，而不是 orchestration runtime。
因此：
- 不默认引入 LangChain / LangGraph
- 不用 graph complexity 掩盖 stage contract 还没钉死的问题

## Relationship to orchestration docs

本文件描述的是 export 专用 bounded runner。
更通用的 runtime contracts 见：
- `documents/orchestration/v1_7_runtime_event_contract.md`
- `documents/orchestration/tool_trace_contract.md`

它们提供：
- progress event shape
- generic trace semantics

但不替代 export stage 的具体输入输出 contract。

## Working conclusion

phase 1 的重点不是引入更复杂的 agent framework，而是：
- 用轻量 runner 跑通 `P0 -> P1 -> E0 -> E1 -> E2 -> E3`
- 把 validator 和 repair 的边界钉死
- 让 prompt debugging 围绕清晰的 stage artifact 进行

当前默认答案是：
- bounded chain
- explicit artifacts
- independent stage calls
- no LangChain / LangGraph by default
