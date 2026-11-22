# 文档地图

更新：2026-11-06。先按问题找文档，不必从01读到19。

## 最短阅读路径

- **制作人第一次使用**：[工作流](01-workflow.md) → [日常目录与会话](13-daily-workspaces.md)。需要开关服务再看[启动](10-daily-operation.md)。
- **Codex接手任务**：[AI入口](../AGENTS.md) → [能力总表](05-validation.md) → [Codex角色](../rules/roles/codex.md) → [现场核对](14-ai-handoff.md)。实施时按需看委派、问答和等待。
- **DSH独立或受委派接手**：[DSH角色](../rules/roles/dsh.md) + 当前目标/工作包。可直接用原生客户端，不必经过Codex；需要时参考[可选提示词](../rules/prompts/dsh-independent.md)，不把模板当执行门槛。
- **维护连接器**：[能力总表](05-validation.md) → [架构](06-architecture.md) → 对应源码与测试 → 相关历史证据。
- **改角色或规则**：[规则总入口](../rules/README.md)。先查如何加载，不直接把旧实验规则发给新项目。

## 按主题查找

| 分类 | 文档 | 回答什么 |
|---|---|---|
| 工作流 | [01 工作流与责任](01-workflow.md) | 谁负责、怎么推进、什么时候问制作人 |
| 日常使用 | [13 项目与会话](13-daily-workspaces.md)、[08 会话连接](08-session-connections.md) | 加目录、选会话、权限标签、允许/暂停/断开、列表移出/恢复 |
| 日常使用 | [10 启动关闭](10-daily-operation.md)、[04 命令速查](04-operations.md) | 打不开怎么办、服务是否运行、命令是否调用模型 |
| 规则配置 | [规则入口](../rules/README.md)、[03 配置](03-configuration.md) | 角色/行为在哪里改，如何生效，哪些只是说明 |
| 真实状态 | [05 验证总表](05-validation.md) | 已实现、真实验证、模拟验证、缺口 |
| 评估统计 | [19 使用说明](19-evaluation.md)、[18 规划与实施范围](18-evaluation-plan.md) | 已实现 DSH 观察区间账单；用量/耗时/估算口径及未接入来源 |
| 任务反思 | [反思入口与结构](../reflections/README.md) | AI 简述问题、原因、处理与改进；同任务一份 |
| 服务排错 | [20 服务退出记录](20-service-audit.md) | 退出事件、日志位置与不能证明的原因 |
| 规划者工具 | [14 安全核对](14-ai-handoff.md) | 不暴露私有数据地读取当前绑定和权限 |
| 规划者工具 | [15 明确委派](15-planner-delegation.md) | 预览、实际发送、工作包路径、防重发 |
| 规划者工具 | [09 技术问答](09-native-routing.md)、[17 反馈等待](17-feedback-wait.md) | DSH找谁、Codex怎样答、怎样减少轮询 |
| 安全专题 | [16 权限与Pilot修复](16-permission-approval.md) | 当前ask设置、最小Shell证据、恢复限制 |
| 工程维护 | [02 环境](02-preparation.md)、[06 架构](06-architecture.md)、[07 待办](07-next-steps.md) | 工具版本、模块职责、还缺什么 |
| 旧实验专题 | [11 固定fixture权限](11-file-task-permission.md)、[12 接入试验](12-web-file-route.md) | 当时怎样验证，不作为所有工程的限制 |
| 历史追溯 | [history索引](../history/README.md) | 什么时候改、当时依据与结果 |

## 信息的分工

05维护当前能力结论；专题维护操作；rules维护模型职责与行为；任务工作包维护具体目标和范围；history保留当时事实。当前运行状态必须现场读，不能从历史报告推断。角色文件存在不证明会话已加载，接口存在不证明真实执行通过。

文件编号和旧路径保留，避免已有链接和代码引用失效；新增导航提供分类，不为整理而移动现有加载文件。不要新增多份互相竞争的“当前总表”。
