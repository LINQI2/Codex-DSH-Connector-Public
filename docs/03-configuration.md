# 03 设置与配置：在哪里改

现行说明，2026-11-05。能力与验证见[05 总表](05-validation.md)，项目操作见[13 日常目录](13-daily-workspaces.md)。

| 设置 | 位置 | 生效方式 |
|---|---|---|
| 连接双方、协作方式、允许/暂停/断开 | 连接设置页；src/bindings.mjs | 保存与核对后显式允许；更换设置使旧核对失效，不发模型消息 |
| 已登记项目 | 私有 config/local.json 的 connectedProjects | 核对原生路径后登记；长驻设置页启动时加载，修改后正常重载设置服务；不授予写入 |
| 官方 Host、home、基础 Session | config/local.json；config/example.json 为公开格式示例 | 命令读取配置；不复制认证、不随意换 Session |
| DSH 原生权限选择 | 原生输入框底部；officialHost.home/profiles/probe/cordis.patch.yml | 用户可选仅查看、项目内开发、完整访问（会话级）；默认仍只读，不替用户切换。完整访问使用官方danger-full-access预设ID并保留原生确认 |
| DSH 需要额外权限时询问 | 同一profile的approval.policy及permission.presets各项approval | 2026-11-05经批准改为ask；当前Pilot已持久化应用。旧会话可能保留never，需用户在原生菜单重新选择所需预设；详情见[16](16-permission-approval.md) |
| Codex 原生权限 | Codex 客户端 | 连接器仅显示最近本机记录，不代改权限 |
| 角色职责 | [规则入口](../rules/README.md)、[Codex](../rules/roles/codex.md)、[DSH](../rules/roles/dsh.md) | 新增独立文档，由接手者明确读取；当前没有统一角色自动注入，configure不会自动拼入roles |
| 模型协作行为 | [rules/interaction.md](../rules/interaction.md) | scripts/session.mjs configure 显式发送，会调用真实模型及协作方式询问；不自动更新旧对话 |
| 旧 fixture 开发规则 | [rules/development.md](../rules/development.md) | 旧实验准备时装入专用 profile；不自动装入所有已有项目 |
| 技术提问与答复 | scripts/mcp.mjs、src/mailbox.mjs、src/routing.mjs | DSH 官方 MCP 客户端已加载 ask_codex；持久化问题不等于 Codex 被唤醒 |
| Codex等待DSH反馈 | Lab的.codex/config.toml中connector_feedback_wait；scripts/planner-wait-mcp.mjs | 已注册只读工具；原会话需重载发现，单工具超时950秒；详见[17](17-feedback-wait.md)，不是空闲自动唤醒 |
| 投递和绑定记录 | 私有 .runtime | 自动记录，不手改成成功、不删 unknown 绕过 |
| 连接器候选显示 | .runtime/session-visibility.json | 页面移出/恢复只更新隐藏名单，不删除客户端会话；当前绑定须先断开 |

## 批准框和权限不是同一件事

当前版本的执行批准仅支持“允许一次/拒绝”，不是连接器隐藏了“允许全部”。同范围的业务批准不重复询问，原生执行批准通过一次有界任务调用尽量合并；不能用never自动拒绝策略实现免审批，也不能将持续Full Access当作范围受限的全部允许。细节和已核实结果见[16](16-permission-approval.md)。

官方 ask_user_question 显示询问卡片并等用户回答；已在原验证会话实测。不是所有操作前自动弹出的系统权限框，不承诺声音或后台弹窗。

明确直发面板已有预览确认，confirm-new 模式也有相应发送门禁；尚无覆盖所有原生客户端操作的程序审批层。普通技术工作默认自主，不将每条技术答复变成新审批。用户选择权限菜单与回答产品问题也不能被模型冒充。

DSH侧已有本地MCP提问服务；Codex侧已注册只读反馈等待工具，真实stdio连接通过，原会话重载及实际长等待仍待验收。回合结束后的持续接收/自动唤醒仍未完成。不要笼统写“项目没有MCP服务”，也不要把提问登记或工具等待写成完整自动双向协作。

## 修改与回退

修改前保存对应规则/配置备份。涉及 profile 热加载、服务重启或发送时，先核对执行、询问和未知投递，按实际风险处理；只改文档不重启服务。configure 是真实调用，规则 hash 作为稳定请求标识，已有尝试不得盲重发。

回退规则需要明确通知当前会话，恢复本地文件不撤销已经发出的消息。不得删历史假装从未设置。涉及新目录 ACL/完整性标签、管理员或范围扩大，须先说明范围、风险与恢复方法取得授权；固定 fixture 修复不推广到 Pilot。

