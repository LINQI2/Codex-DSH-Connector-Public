# 11 限定文件执行与权限恢复

本页是固定fixture的专题和2026-10-31试验证据，不是所有已有项目的全局限制。现行已有项目与手动权限选择见[13 日常目录](13-daily-workspaces.md)，能力总表见[05](05-validation.md)。下文“本轮”均指当时试验。

2026-10-31 当前状态：真实文件闭环通过，16个对象的权限恢复核验通过。不是RRPG或Unity接入验收。准备时的原说明保存在 history/2026-10-31-file-task/PERMISSION_PREPARATION.md.txt，不作为当前状态。

## 已得到的三次明确授权

1. 仅 fixtures/file-task-20261031 读写源码、运行Node测试。
2. 上述目录及 .runtime/file-task-temp/dsh-* 本轮私有子目录的必要原生ACL/Low标签，先备份、后恢复。
3. 官方脚本不提供继承授权时，仅fixture和 .runtime/file-task-temp/dsh-task-20261031 及本轮新对象增加可继承WRITE_OWNER并恢复。这不是官方诊断脚本自身功能，已单独获批。

不改所有者、不使用管理员、不改父目录、不切Full Access，不接正式RRPG或旧Pilot，不扩大原问答Session。

## 真实故障及有限修复

| 实际错误 | 处理和结果 |
|---|---|
| fixture SetNamedSecurityInfoW / grantWrite Win32 5 | 普通用户宿主对准确目录执行官方diagnose-windows-sandbox-acl |
| 私有dsh-task目录 grantWrite/revokeWrite Win32 5 | 该私有目录运行一次官方修复，不处理系统Temp |
| 新子目录仍无法设置原生标签 | 根目录权限不继承；按第三次授权补充限定继承WRITE_OWNER，没有重复失败脚本 |
| Node测试运行器 spawn EPERM | 使用Node原生 --test-isolation=none，保留全部断言及Windows原生沙箱，避免框架额外创建进程 |
| SDK恢复后编辑被read-before-edit拒绝 | DSH自行重读并编辑，未取消保护 |

最小官方Shell命令实际退出0。独立DSH执行Session为 connector-file-00000000-0000-4000-8000-000000000001，两次模型Turn沿用同一Session；第一轮因EPERM停止，没有伪称通过。第二轮3项红测中2失败，实际修改summary.mjs后3通过、0失败、0跳过；测试文件与README指纹未变。清理后宿主再核对3项通过。

## 权限回收和证据

执行器退出后核对16个对象：清除本轮Low标签、恢复原对象DACL、新临时对象恢复继承；所有者和交付内容未改。专用可写profile移出活动profiles，归入私有证据并核对文件指纹。临时目录及证据保留，不宣称已全部删除。

该次验收时原问答Session为probe-read-only、seq99，不是当前实时状态。官方0.2.1-rc.2 Windows后端主要限制写入，不能当作完整读/网络/进程隔离；工作区standing grant不随普通Session结束全部撤销。该次试验不用网络命令，不宣称网络隔离通过。

| 文件 | 用途 |
|---|---|
| scripts/file-task-run.mjs | 本轮有界SDK执行与一次续接，已有记录则拒绝重跑 |
| scripts/file-task-acl.ps1 | 两个固定目录的快照、已授权元数据准备、恢复核验，不是通用授权入口 |
| scripts/file-task-temp-diagnosis.mjs | 官方原生临时目录诊断，不调用模型 |
| scripts/file-task-history.mjs | 官方历史查询与工作区元数据登记，不调用模型 |
| .runtime/file-task-evidence/ | 私有原始日志、权限备份/恢复脚本、执行状态和核验结果，不整包公开 |

可读结果见[文件验收记录](../history/2026-10-31-file-task/ACCEPTANCE.md)。新目录、父目录权限、管理员或范围扩大不属于该次授权。不要为了检查重跑付费模型或权限准备。后来固定fixture的正常自动准备/回收已接入维护区；意外退出与回收异常仍需核对，不宣称通用自动恢复已完成。不得将本脚本用于Pilot或其他已登记项目。
