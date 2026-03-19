# Export AI Handoff (compact) Architecture

Status: Expert-facing bridge doc  
Audience: Prompt engineers, runtime engineers, domain experts, release owners

## Purpose

这是给专家沟通使用的单文档入口，用来解释 Vesti 里 **AI Handoff (compact)** 的当前状态、真实约束和未来演进方向。

它把目前分散在多份文档里的四层信息收在一起：
- 当前已经 shipped 的运行路径
- 当前 prompt/runtime contract
- 进入实现前已经锁定的架构承诺
- 未来 export multi-agent 的目标架构

如果只看一份文档来理解 Vesti 现在如何做 AI handoff，以及后续应该如何把它从 shipped bridge state 推进到 bounded chain，优先看这一份。

## Why AI Handoff

长程 agent 遇到的问题，通常不是模型突然不够强，而是上下文逐步失真。

常见失真方式包括：
- 旧工具结果还在上下文里，但已经失去权重
- 中间状态被反复转述后，决策依据逐渐模糊
- 摘要保留了表层话语，却丢掉了真正的任务状态
- 下一个 context window 继承了文本，却没有继承可继续执行的状态

所以 AI handoff 的目标不是“把聊天记录变短”，而是：
- 折叠旧工具结果，把稳定状态保留下来
- 在 context budget 接近阈值时触发压缩，而不是任意缩短文本
- 保留 grounded decisions、artifacts、constraints、unresolved work
- 把下一个窗口真正需要继续执行的任务状态提纯出来

这里的核心不是 transcript shortening，而是 **task-state distillation**。

## Current shipped path

当前 shipped 的 AI Handoff 路径，还不是完整的 multi-agent runtime，而是一个 bridge state。

### 已经落地的部分

现在真实运行的是：

1. `E0 dataset_builder`
   - deterministic local stage
   - 收集 selected threads、ordered messages、metadata、export mode

2. `E3 compact composer`
   - prompt-driven export composition
   - 通过当前 model/profile 路由执行
   - 外围已有 validator、diagnostics 和 deterministic local fallback

### 还没有 runtime 化的部分

这些阶段目前还没有作为独立 runtime stage 落地：
- `E1 structure_planner`
- `E2 evidence_compactor`
- 独立的 `repair` artifact contract

因此当前 shipped path 更准确的描述是：
- `E0 dataset_builder`
- 直接进入当前 compact composer
- 在输出后做 validation / diagnostics / fallback

## Current runtime contract

### Runtime source of truth

当前 runtime prompt source 仍然是：
- `frontend/src/lib/prompts/**`

`documents/prompt_engineering/**` 负责解释 contract、architecture、inventory 和 governance，但不是 runtime prompt text authority。

### Shipping headings

当前 shipping 的 **AI Handoff (compact)** 仍然要求这些 exact headings：
- `## Background`
- `## Key Questions`
- `## Decisions And Answers`
- `## Reusable Artifacts`
- `## Unresolved`

这些 headings 不是参考建议，而是 live validator contract 的一部分。

### Current model/profile routing

当前 export 路径已经是 model-profile aware 的。当前 active export profiles 是：
- `kimi_handoff_rich`
- `step_flash_concise`

这两套 profile 目前会影响：
- prompt budget
- prompt strategy
- export composition behavior
- fallback expectations

## Locked implementation decisions for the next phase

### 1. `E1/E2` 是 shared stage slots，但实现采用 separate prompt artifacts

这一轮文档不再只写 “mode-parameterized shared stages”，而是明确锁定为：
- `E1/E2` 共享的是 stage slot、stage names、artifact boundary、orchestration position
- `E1/E2` 不共享一套中立 prompt
- `E1/E2` 的实现采用 **separate prompt artifacts**

对于 AI Handoff 路径，目标 prompt artifacts 是：
- `export_e1_handoff_structure_planner`
- `export_e2_handoff_evidence_compactor`

这意味着 shared stage 不等于 shared prompt；`Compact` 和 `Summary` 在 `E1/E2` 共享流程骨架，但各自持有独立的 extraction logic。

### 2. 当前 profile routing 明确视为 bridge-state

现有 profile 命名混合了：
- model identity
- task/output intent

因此文档明确将当前 profile routing 定位为 **bridge-state**，而不是最终抽象。

未来目标拆分是双轴：
- model axis：`kimi`、`step`
- task axis：`handoff`、`knowledge`

### 3. 双轴 profile 的 phase 1 activation 先只激活 `kimi + handoff`

为了避免双轴拆分一开始就变成四条半调优路径，这轮先锁定：
- phase 1 handoff activation：`kimi + handoff`
- `step + handoff` 暂不作为 phase 1 的调优主路径

`step` 仍然保留为兼容 / fallback 基线，但不是 handoff decomposition 第一阶段的主要调优目标。

### 4. `P0 -> P1 -> E0` 继续保留为上游边界，且 `P1` 采用 structured sidecar annotation layer

在跨平台场景下，`E0` 之前必须存在：
- `P0 platform_normalizer`
- `P1 semantic_annotator`

并且 `P1` 不再只被描述为“某种语义标注”，而是明确为：
- **structured sidecar annotation producer**
- 不是自然语言注释
- 不是散文式说明
- 不是直接污染标准化消息主体的内联拼接文本

## Current pain points

当前 AI Handoff 的主矛盾是 prompt-engineering stability，不是 infra。

现在已经基本排除掉的方向包括：
- proxy auth 作为主阻塞
- model switch 没生效
- export route 选错

现在真正不稳定的部分是：
- exact heading compliance
- grounded section density
- artifact preservation
- `Kimi-K2.5` 在 compact 输出上的稳定性

因此，下一个阶段最该做的不是再做一轮 infra 排查，而是继续收紧 prompt、validator 反馈和 bounded decomposition。

## Target architecture

未来 AI Handoff 应该演进成一条 bounded chain，但这里的“bounded”要连同 pre-`E0` 边界一起理解：

0. `P0 platform_normalizer`
1. `P1 semantic_annotator`
2. `E0 dataset_builder`
3. `E1 structure_planner`
4. `E2 evidence_compactor`
5. `E3 compact composer`
6. optional `repair`

### `P0 platform_normalizer`
- upstream normalization stage
- 负责把不同平台的线程 / 消息 / role / metadata 归一成统一内部表示
- 仍以 deterministic mapping 为主

### `P1 semantic_annotator`
- heuristic / semantic labeling stage
- 输出 structured sidecar annotation layer
- 标注 handoff 可能需要的重要信号，例如：
  - correction turns
  - tentative decisions
  - artifact markers
  - unresolved cues
- 不是最终 export agent stage，但决定 `E0` 之后的数据质量上限

### `E0 dataset_builder`
- deterministic local stage
- 从已归一、已标注的内部表示中装配 export dataset
- 为后续 stage 提供稳定输入面

### `E1 structure_planner`
- 识别这次 handoff 的重点
- 判断：
  - task frame
  - artifact density
  - decision density
  - unresolved density
  - likely handoff focus
- 输出 planning notes，而不是最终 markdown
- 共享 stage 槽位，但使用 handoff 专用 prompt artifact

### `E2 evidence_compactor`
- 负责提纯任务执行状态
- 提取：
  - constraints
  - decisions
  - decision rationale
  - concrete artifacts
  - unresolved work
- 输出 evidence skeleton，而不是给最终用户看的成品
- 共享 stage 槽位，但使用 handoff 专用 prompt artifact

### `E3 compact composer`
- 把 evidence skeleton 组装成 shipping compact markdown
- 保持 profile-aware
- 负责最终的 transfer fidelity 与可读性

### `repair`
- 只在 structured-output failure 之后触发
- 针对 expected contract 做 bounded repair
- 不能演变成开放式 retry tree

## Why AI Handoff is the first implementation path

在真正进入 runtime decomposition 时，`AI Handoff` 应先于 `Knowledge Export` 落地。

这不是因为 handoff “更简单”，而是因为它有更紧的 feedback loop：
- 下一段 agent 是否重复追问已经决定的事情
- 是否尊重已确认的 constraints
- 是否处理 `Unresolved` 里列出的待办

这些都更容易被操作化评估。

因此 phase 1 的务实顺序是：
1. 先验证 `P0 -> P1 -> E0 -> E1 -> E2 -> E3` 在 handoff 路径上成立
2. 再把 knowledge 路径作为共享前段之上的第二条 composer 方向扩展

## Known architecture risks

### 1. bounded `repair` 被悄悄扩成循环

AI Handoff 很容易在“为了让下一个 agent 更顺”这个理由下长出额外回路。
需要明确防守：
- `repair` 只能 one-shot
- `repair` 不能回头驱动 `E2` 重提取
- `E3` 不能反向要求 workflow 改写拓扑

### 2. handoff 与 knowledge 共用 `P1` 时的 label-set 膨胀

当前 shared upstream annotation layer 是合理的，但中长期需要警惕：
- handoff 想要更细的 decision / unresolved traces
- knowledge 想要更细的 reusable / recall cues

如果缺少治理，`P1` 可能变成一个不断膨胀的 label bucket。

## Deliberate non-goals

AI Handoff 的方向明确 **不包括**：
- 把中文专用 schema 直接变成默认 shipping contract
- 把 compact 做成自由散文式摘要
- 继承 Explore 整套 session model 或 tool taxonomy
- 引入开放式 reflective loop
- 把 export 变成泛用 orchestration shell

AI Handoff 应该保持：
- bounded
- export-centric
- contract-driven
- artifact-preserving

## Relationship to other docs

这份文档是 **first-read** 入口。看完这一份之后，再按需要进入细分 canonical docs：
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

## Working conclusion

Vesti 已经有一条真实可运行的 AI Handoff 路径，但它目前仍然处在 bridge state：
- runtime path 已经存在
- contract 已经存在
- diagnostics 已经存在
- multi-agent decomposition 还没有真正拆开

这轮文档收口要强调的是：
- `E1/E2` 是 shared stage slots，但实现采用 separate prompt artifacts
- 当前 profile 路由只是 bridge-state，不是最终 task/model 解耦
- phase 1 先聚焦 `kimi + handoff`
- 对跨平台场景而言，`P0/P1` pre-`E0` 层是架构必需品，而不是实现细节
