# 06 技术结构与文件职责

更新：2026-11-05。能力是否真实通过以[05](05-validation.md)为准；角色文件与加载查[规则入口](../rules/README.md)。

## 实际数据路径

1. 设置页通过本机回环服务查询候选、保存一对会话绑定；登记不是任务授权。
2. Codex用已有CLI明确派发工作包，原投递器核对绑定、权限、忙状态、稳定编号和锁，再向准确DSH原生Session发送。
3. DSH在官方客户端执行并显示公开过程；技术问题经ask_codex和原生来源核对写入Mailbox。
4. 活动Codex可使用只读等待工具监听；问题返回后明确读取、裁决和答复，触发原DSH续接。等待工具本身不发消息。
5. 采用委派时，按约定由Codex读取成果和证据核验；DSH独立工作不需经过该链，能自行规划、验证与收尾。受理、回合结束和任务验收不是同一状态。

这不是全聊天自动转发，也未部署Codex回合结束后的持续自动接收和即时唤醒。当前不重建另一套聊天客户端。

## 模块分工

| 位置 | 职责 |
|---|---|
| src/config.mjs | 私有配置、准确回环Host校验 |
| src/web-api.mjs | 官方RPC和Cookie、workspace/follow首次侧栏基线、session/follow订阅 |
| src/client.mjs | 精确Session的历史、状态、prompt、稳定requestId和发送日志 |
| src/workspaces.mjs | 已登记目录查询、候选、旧固定fixture生命周期 |
| src/sidebar-sessions.mjs、src/session-catalog.mjs | DSH侧栏、Codex本地只读索引及隐藏名单；不删除原生会话 |
| src/permission-view.mjs | DSH当前preset与Codex最近权限记录的区别显示 |
| src/bindings.mjs | 一对绑定、版本、核对、允许、暂停、断开与门禁 |
| src/delegate.mjs、scripts/delegate.mjs | 主开发CLI；默认预览、显式发送，复用原Dispatcher |
| src/dispatch.mjs | 发送保护、本地互斥锁、投递与unknown记录 |
| src/routing.mjs、src/mailbox.mjs、scripts/mailbox.mjs | 原生提问来源核对、问题/答复关联与明确续接 |
| scripts/mcp.mjs | DSH使用的ask_codex，仅技术问答，不提供Shell |
| src/feedback-wait.mjs | 只读事件过滤、待答问题、空闲、断线、取消和超时处理 |
| src/planner-wait-mcp.mjs、scripts/planner-wait-mcp.mjs | Codex使用的只读wait_dsh_feedback，等待中响应ping与取消 |
| src/receiver.mjs | 本地接收登记和停用状态，不是已完成的持续自动路由器 |
| src/lifecycle.mjs、src/service-control.mjs | 自有服务控制、PID身份、正常关闭和失效记录归档 |
| scripts/desktop.mjs、scripts/host.mjs、scripts/connections.mjs | 日常启动、原官方Host和设置服务；不创建模型任务 |
| rules/roles、rules/interaction.md | 通用角色与协作行为，加载方式不同，不自动全局注入 |
| rules/development.md、scripts/file-task-* | 旧固定fixture专用规则与验证工具，不作为新项目通用流程 |

## 协议与安全边界

RPC使用client-request和payload.args，不同方法的内层参数不同，不能猜测。workspace/follow仅首次侧栏基线后关闭；session/follow是等待工具使用的事件订阅，不应笼统说完全没有监听。prompt使用稳定requestId，page只读取准确会话事件。具体步骤查[15委派](15-planner-delegation.md)、[09问答](09-native-routing.md)、[17等待](17-feedback-wait.md)。

CLI与页面共享runtime投递锁，不保证跨不同runtime或用户直接操作原生客户端的全局互斥。JSON持久化、稳定requestId不证明永久幂等或灾难恢复；unknown先核对，不自动重发。

303/Cookie只建立本机Web认证，不等于DeepSeek账户已登录。认证URL、home、配置和原始日志私有。目录身份、任务授权、原生权限与实际沙箱能力分别核对；旧fixture ACL工具不适用任意已有项目。

## 文档与运行代码的边界

AGENTS负责接手导航；角色文件只规定职责；05记录能力与证据；专题说明操作；history保留当时事实。configure仍只发送interaction正文，旧fixture准备仍只读取development，未因本轮文档整理改变代码、原会话或配置。
