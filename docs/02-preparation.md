# 02 环境准备

当前已有日常启动与复用入口，见[日常操作](10-daily-operation.md)。原home仍保留原位，没有复制认证。

环境版本来自2026-10-31核对，CLI版本于2026-11-04再次验证。现行能力见[05 总表](05-validation.md)，已有项目接入见[13 日常目录](13-daily-workspaces.md)。以下环境准备不是授权任意游戏工程实施。

## 已用环境

- Windows 普通用户；Node 实测 v24.21.0。本项目无需额外 npm 依赖，使用 Node 内置模块。
- 本轮官方 DSH CLI 0.2.1-rc.2；调查到的桌面版0.2.1-rc.3不是此次Web验证执行器。
- 官方CLI启动参数曾实测：`--profile probe --host 127.0.0.1 --port 0 --no-open`，以 Node 运行已安装 JS 入口。不要照社区旧版 `npx.cmd` 调用假定 Windows 一定兼容。
- DeepSeek 模型渠道已核实 `deepseek-account`，不是新 API Key。当前会话选择 DeepSeek-V4.1-Flash。自动标题生成也可能产生模型调用。

## 当前临时连接

原验证 Host 和原生 home 仍在 Studio 报告的 `web-live-20261031` 中；本项目 `config/local.json`只引用该Host信息文件和已确认的Session/工作目录。不会复制 `.credentials.yaml`，也不会将旧会话导入新home。

当前受管Host没有一小时自动退出；目录存在不说明服务还运行。先查 status，失败时停止并诊断，不重启旧 Studio或重建正常会话。项目迁移本身不启动任何新模型或编辑器。

## 将来准备独立 Host 时

只有确实需要另一独立Host时才单独确定官方CLI、DSH_HOME、目录与生命周期；已有项目通常复用当前Host，不必为每个目录新建环境。新home需用户自行登录，不整包复制认证。当前probe保持回环监听、默认只读，审批为ask；用户可手动选择项目内开发或完整访问，菜单提供原生确认，不自动应用。旧会话持久化策略不自动覆盖，实际Shell能力仍按工程验证，见[16](16-permission-approval.md)。

双击根目录打开连接器.cmd，或执行npm run open；启动服务不调用模型。历史限时探针仅用于追溯，不能代替现行入口。当前没有安装系统守护服务。

## 启动前检查

1. 真实Host是否仍监听回环地址，是否属于本轮验证。
2. Session与workspace是否完全匹配，是否在执行或等待用户。
3. 是否存在未知投递或未完成询问，先核对再决定。
4. 费用渠道、任务权限是否仍在本次授权内。

无需切换用户 Codex 工作区、启动 Unity、安装系统组件或提升 Windows 权限。
