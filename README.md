# Codex × DSH 原生协作连接器

公开版本包含连接器源码、测试、配置模板及使用说明。请在自己的运行环境创建连接与本地配置。

**连接器是增加上限的工具，不是形式化、刻板化的硬性流程。** DSH可以独立规划、实现、验证和收尾；需要时再与Codex协作。你在双方原生客户端查看过程、沟通和决定重要事项，连接器减少传话，不强制双人分工。

本项目是独立连接器，不继续建设旧RRPG AI Studio。保存连接不会自动转发所有聊天，也不授予工程权限。真实能力和验证缺口统一看[当前状态](docs/05-validation.md)。

## 从哪里开始

| 你想做什么 | 先读这里 |
|---|---|
| 第一次使用，了解完整流程 | [工作流与责任](docs/01-workflow.md) → [日常项目与会话](docs/13-daily-workspaces.md) |
| 打开、关闭或排查打不开 | [启动与关闭](docs/10-daily-operation.md) |
| 查看或修改角色规则 | [规则总入口](rules/README.md) |
| 让新AI接手 | [AGENTS.md](AGENTS.md) |
| 找功能、配置、命令或源码 | [文档地图](docs/README.md) |
| 查真实通过了什么 | [能力与验证总表](docs/05-validation.md) |
| 查过去改过什么、为什么改 | [开发历史](history/README.md) |
| 看评估模块范围与后续规划 | [评估模块方案与实施范围](docs/18-evaluation-plan.md) |
| 查看任务用量、时间与估算 | [成本与时间评估使用说明](docs/19-evaluation.md) |
| 查任务出了什么问题、怎样解决 | [任务反思](reflections/README.md) |

直接使用DSH时，在其原生会话说明目标和授权即可，不必先绑定Codex。需要协作时，双击 **打开连接器.cmd**，选择并核对双方会话、允许后续明确发送，再使用委派或技术问答。连接页管理关系，日常对话和公开过程仍在原生客户端。关闭见[启动说明](docs/10-daily-operation.md)。

## 文件夹分别放什么

```text
README.md       人和AI都能找到的项目总入口
AGENTS.md       AI接手要求和阅读顺序
rules/          角色职责、协作规则、旧实验专用规则
  roles/        Codex与DSH各自的通用角色规则
  README.md     规则选择、修改和加载说明
  interaction.md  现有configure发送的协作约定
  development.md  旧fixture专用，保留代码兼容
docs/           当前使用、配置、工具、架构与验证说明
history/        日期化变更与证据，不作为当前指令
reflections/    按项目、年份保存 AI 简短任务反思，不代替原始证据
src/ scripts/   实现代码与命令入口
web/ tests/     设置界面与回归测试
fixtures/       已有测试夹具，不是所有任务的工作目录
config/         公开示例与私有本机配置
.runtime/       私有绑定、收件箱、投递、日志及备份
```

修改规则文件不等于会话已收到新规则，加载方式见[规则入口](rules/README.md)。任务授权、原生工具权限与真实执行结果分别核对。私有配置、认证和运行数据不整包外发。
