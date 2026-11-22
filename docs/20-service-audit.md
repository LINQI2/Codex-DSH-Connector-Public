# 20 服务退出记录

2026-11-11已实现基础记录，无需制作人额外操作。没有新增轮询、模型调用、自动重启、任务重发或Windows系统审计配置。

日志在私有 `.runtime/service-audit/`：`dsh.jsonl`、`connections.jsonl`。每项记录含UTC时间、服务、运行标识、进程与父进程编号、事件；不含认证URL、Cookie、聊天正文或原始错误消息。单文件达到约1MB后轮换，最多当前文件和3份旧文件，不处理其他原始证据。

| 记录 | 含义 |
|---|---|
| process-start / service-ready | 进程启动 / 已就绪 |
| shutdown-requested | 关闭入口：control-api、SIGINT、SIGTERM或子进程退出 |
| uncaught-exception | Node未捕获异常的类型和错误码，仍按原行为退出，不吞掉异常 |
| child-error / child-exit | DSH原生子进程的启动错误、退出码或信号 |
| process-exit | Node实际退出时的状态；非正常结束不会包装为正常关闭 |
| previous-end-not-recorded | 上次运行没有留下结束记录，原因仍待核对；不能断言是用户、杀毒软件或宿主回收 |

每服务另有`*-last.json`保存最近运行状态。写日志失败只给一次通用提示，不阻止原任务；强制杀进程或断电时不能保证写出退出日志，由下次启动标注缺口。初次启用没有旧状态，不能追溯启用前的退出。

仅在生命周期事件发生时写入少量文本，无额外定时器；不宣称磁盘写入零开销，也未做长期性能压测。基础回归81/81通过；测试涵盖字段白名单、正常/异常退出、轮换及日志不可写降级，并用真实隔离子进程验证强制终止后的缺口识别。

部署前确认空闲和无投递锁，正常关闭再启动，启动事件已真实写入；原绑定指纹、原Session权限均不变，未发送模型任务。测试日志在`.runtime/service-audit-tests.log`。源码为src/service-audit.mjs，接入scripts/host.mjs、scripts/connections.mjs和src/service-control.mjs；修改前备份在.runtime/lifecycle-audit-before-*。回退只需在正常空闲窗口恢复备份源码，保留诊断记录，不回滚会话或任务。
