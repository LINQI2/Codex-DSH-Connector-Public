# 16 权限修复与需要时询问

2026-11-05制作人批准：修复Pilot Shell；以后需要扩大权限先询问，沿用原生审批，不自动批准。

## 当前结论：允许申请，减少重复确认

禁止未经批准自行扩权，不禁止提出原生权限申请。旧任务中的“不改权限/不使用Full Access”不能自动解释成永久不准询问；若该任务明确禁止连申请本身也禁止，则先说明冲突，不能绕过拒绝。

业务授权与执行批准分开：同一已批准范围内的技术修复不再重复请求业务批准。先用现有权限完成预检，再将同一任务连续步骤组织成一个可审阅、有界调用，避免“暂存一次、核对一次、提交一次”都请求新批准。一次调用内每步仍须检查真实结果，范围变化、明确拒绝或未知副作用时停止受影响部分。

安装版本0.2.1-rc.2实际源码的ApprovalOutcome只有allowed-once/rejected/cancelled/unavailable，网页只提供允许一次/拒绝；没有本任务全部允许或记忆命令授权。ask是询问，never是自动拒绝，不能把never当全部允许。此限制来自官方实现，不是连接器隐藏按钮。

该版本从workspace-write申请更宽的单次执行时，目标是danger-full-access。单次批准不等于持久切换整个会话，但本次进程的实际文件访问能力比“仅写.git”更宽；文字理由不是强制目录隔离。不能自动代批、用Editor绕行或把长期Full Access说成任务级授权。官方不支持的“允许全部”尚未由本项目实现；本轮没有修改官方包或建立额外授权代理。

2026-11-05后续：制作人提供的原生截图已证明权限申请卡片可显示，DSH后续成功在一次性批准流程后完成本地提交；不能再笼统说原生申请入口不可用。105文件提交f294485869d449b1d4cc84212fb20a52a38cf6d2已独立只读核对，文件集合精确一致；并不据此批准今后全部Git操作。后续记录见[审批流程与提交核对](../history/2026-11-05-approval-flow/REVIEW.md)。下文原“未主动触发弹框”只指最初最小Shell修复时点。

## 现在的设置

2026-11-05后续制作人明确要求给出全部权限选择：日常profile已提供probe-read-only、project-write、danger-full-access三档，approval仍为ask，defaultPreset仍是probe-read-only。完整访问由用户在原生菜单手动选择，并保留官方确认，未替任何既有会话应用。配置在officialHost.home/profiles/probe/cordis.patch.yml；本轮备份在私有.runtime/full-permission-options-1793893758693/profile-before.yml，最初配置备份仍保留。

完整访问是持续的会话文件模式，不是任务级记忆allowed-once。它不再用文件沙箱限制普通用户可访问的工程外路径，减少文件/Git命令的反复扩权申请；其他工具和系统审批仍按实际行为处理。用户可随时手动切回项目内开发或只读，不须新建会话。注册选项不等于已经授予当前会话完整访问，也不批准正式工程任务。

原Pilot Session通过官方无模型/permission project-write命令重新应用，其approval/policy事件seq170为ask。其他已有会话持久化策略未被逐一改写；保留never的旧会话可能显示自定义权限，用户在原生菜单重新选择预设后才应用ask。不要声称所有旧会话都自动迁移。旧fixture维护profile保持独立never配置，不扩展其原授权。

原生支持的一次性扩权请求应显示准确操作及原因，只有真人批准才能执行。没有可用审批界面、用户拒绝、取消或不答均不算批准。部分Windows初始化错误发生在命令之前，不保证自动出现批准卡片；模型应在原生会话明确问“需要谁在什么目录做什么”，不能只登记技术协助或建议默认Full Access。本轮确认ask实际生效，未主动触发超范围操作测试弹框，不将配置存在等同端到端审批通过。

## Pilot此次真实修复

错误为SetNamedSecurityInfoW / grantWrite(Pilot repo) / Win32 5。目录所有者是当前用户，但匹配权限缺WRITE_OWNER；官方脚本有效权限判定也给出writeOwner=false、writeDac=true。原因是原生受限Shell准备需要修改安全标签，不是命令工具不存在或模型漂移。

经本轮批准，在普通用户非受限宿主运行官方诊断修复，Path与AllowRoot均精确为<本地路径>。只补当前用户根目录权限，官方重新读取verified；无拒绝/回滚。扫描子树达到2000项上限并报告truncated，不能说全树诊断完整；没有再重复脚本。

原Session真实模型仅1 Turn/2步，调用一次pwsh：Write-Output PILOT_SHELL_PROBE_OK; Get-Location; exit 0。seq186的原生job/settled明确detail为exit code: 0，seq187工具成功输出标记，seq193 completed。它是维护核验，不继续游戏工作包。未处理编辑器或Unity工具接入。

修复前保存36015对象的所有者/DACL/标签；修复后36051对象（新增对象保留，不删除），既有对象仅根安全描述改变、所有者0变化、1292项已有dirty/untracked文件哈希0变化。根保留1项Low标签及原生能力项，供受限Shell继续使用，没有宣称已回退；该标签可能让同用户的其他Low进程获得原先没有的写入机会，是官方Windows后端已知边界，不是完整读/网络隔离。

## 恢复与限制

私有.runtime/pilot-repair-20261105/保存security-before.jsonl、security-after.jsonl、verified.json、文件哈希、profile备份、原生probe事件，以及official/中的DACL备份和官方恢复命令。

需要恢复时先停止DSH相关执行，核对根及新增对象。官方DACL恢复不包括安全标签，不能直接称为完整回退；应按原标签快照先核对原生撤销/标签恢复，再恢复DACL，最后核对所有者、标签和文件。未来新增对象可能继承标签，不能用本次“只有根变化”的观察推定未来同样如此。没有授权自动清除所有新对象、修父目录或换管理员。

本次只证明最小只读Shell成功，不证明旧子目录写入、dotnet测试子进程、编译器、完整Unity或Initial World完成。后续每种新错误按真实路径分类，需要新权限则先询问，不无限重复或自动扩权。
