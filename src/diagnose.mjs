import fs from 'node:fs';
import path from 'node:path';
import {hasDevelopmentAccess,nativePermission} from './permission-view.mjs';
const norm=p=>typeof p==='string'?path.resolve(p).toLowerCase():null;
const read=(file,fallback)=>fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):fallback;
export async function diagnose({runtime,config,configFor,rpcFor,expectedThread,expectedWorkspace}){
 const report={checkedAt:new Date().toISOString(),modelCalls:0,binding:null,dsh:{checked:false,running:null,permission:'未读取'},localRecords:{checked:false},automaticRouting:false,blockers:[],next:[]};
 let b;
 try{b=read(path.join(runtime,'binding.json'),null);}catch{report.blockers.push('BINDING_UNREADABLE');report.next.push('连接记录不可读，由连接器维护者检查；不要重建会话或删除记录。');return report;}
 if(!b){report.blockers.push('NO_BINDING');report.next.push('请在连接器选择双方并保存、核对、允许。');return report;}
 report.binding={state:b.state,mode:b.mode,codexThreadId:b.codex?.threadId,codexHostId:b.codex?.hostId,dshSessionId:b.dsh?.sessionId,workspace:b.dsh?.workspace};
 if(expectedThread&&expectedThread!==b.codex?.threadId)report.blockers.push('WRONG_CODEX_THREAD');
 if(expectedWorkspace&&norm(expectedWorkspace)!==norm(b.dsh?.workspace))report.blockers.push('WRONG_WORKSPACE');
 if(b.state!=='enabled'||b.mode==='paused')report.blockers.push('CONNECTION_NOT_ENABLED');
 if(fs.existsSync(path.join(runtime,'dispatch.lock'))){report.blockers.push('DISPATCH_LOCK_PRESENT');report.next.push('存在投递锁；先核对投递进程和原生结果，不手工删除锁或重发。');}
 try{
  const questions=read(path.join(runtime,'questions.json'),[]).filter(q=>q.bindingId===b.id&&q.sessionId===b.dsh.sessionId&&q.codex?.threadId===b.codex.threadId);
  const folder=path.join(runtime,'dispatches'),dispatches=fs.existsSync(folder)?fs.readdirSync(folder).filter(n=>n.endsWith('.json')).map(n=>read(path.join(folder,n),null)).filter(r=>r?.sessionId===b.dsh.sessionId):[];
  report.localRecords={checked:true,pendingTechnicalQuestions:questions.filter(q=>q.state==='pending').length,unresolvedDeliveries:questions.filter(q=>['unknown','answer-attempted'].includes(q.state)).length+dispatches.filter(r=>['attempted','unknown'].includes(r.state)).length};
  if(report.localRecords.unresolvedDeliveries)report.blockers.push('UNRESOLVED_DELIVERY');
 }catch{report.blockers.push('LOCAL_RECORDS_UNREADABLE');}
 // A wrong target must not cause even an authenticated query to that workspace.
 if(report.blockers.some(x=>['WRONG_CODEX_THREAD','WRONG_WORKSPACE'].includes(x))){report.next.push('当前绑定与调用者预期不符，请制作人核对选择；不改绑、不投递。');return report;}
 try{
  const c=configFor(b.dsh),rpc=await rpcFor(c.hostReadyFile),list=await rpc('session/list',{_request:{}});
  const s=list.items.find(s=>s.sessionId===b.dsh.sessionId&&norm(s.cwd)===norm(b.dsh.workspace));
  if(!s){report.blockers.push('DSH_IDENTITY_MISMATCH');report.next.push('原生来源未找到匹配的会话和目录；不要新建替代或发送。');}
  else{
   const preset=s.projections?.values?.permissions?.currentValue;
   report.dsh={checked:true,identityMatched:true,running:typeof s.running==='boolean'?s.running:null,permission:hasDevelopmentAccess(preset)?nativePermission(preset).label:['probe-read-only','read-only'].includes(preset)?'只读':'未确认',sameWorkspaceBusy:list.items.some(x=>norm(x.cwd)===norm(s.cwd)&&x.running===true)};
   if(!hasDevelopmentAccess(preset))report.next.push('如要实施文件修改，请在原生会话手动选择适当权限；项目内开发或用户自行选择的完整访问均支持，审计可继续。');
   if(report.dsh.running===null)report.blockers.push('DSH_RUNNING_UNKNOWN');
   if(report.dsh.sameWorkspaceBusy)report.blockers.push('WORKSPACE_BUSY');
  }
 }catch{report.blockers.push('DSH_CHECK_FAILED');report.next.push('DSH本机连接、认证或目录配置核对失败；由维护者定位，不输出私有配置，也不反复重发。');}
 if(report.localRecords.pendingTechnicalQuestions)report.next.push('当前绑定有技术问题等待活动Codex读取，可运行 npm run inbox；后台不会保证自动唤醒。');
 if(report.localRecords.unresolvedDeliveries)report.next.push('先核对原投递；不得换编号重发。');
 report.next.push('本报告不授予实施权限，不证明Shell或Unity可用；游戏修改仍需既有任务授权。');
 return report;
}
export function renderDiagnosis(r){
 const blockers={BINDING_UNREADABLE:'连接记录不可读',NO_BINDING:'尚未绑定双方会话',WRONG_CODEX_THREAD:'当前绑定不是预期Codex会话',WRONG_WORKSPACE:'当前绑定不是预期工程',CONNECTION_NOT_ENABLED:'连接尚未允许发送或已暂停',UNRESOLVED_DELIVERY:'有投递结果待核对',LOCAL_RECORDS_UNREADABLE:'本地投递记录未核实',DSH_IDENTITY_MISMATCH:'原生DSH会话或目录不匹配',DSH_RUNNING_UNKNOWN:'DSH运行状态未确认',WORKSPACE_BUSY:'同工程已有执行或等待中的会话',DSH_CHECK_FAILED:'DSH连接或配置核对失败'};
 const state={enabled:'已允许发送',paused:'后续发送已暂停',draft:'已保存待核对',verified:'已核对待允许',disconnected:'已断开'};
 const mode={autonomous:'授权范围自主推进','confirm-new':'新工作包先确认',paused:'暂停委派'};
 return ['连接器只读核对（不发送模型消息）','核对时间：'+new Date(r.checkedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})+'（北京时间）',
 '连接：'+(state[r.binding?.state]??'未确认'),...(r.binding?['规划会话：'+r.binding.codexThreadId,'执行会话：'+r.binding.dshSessionId,'执行目录：'+r.binding.workspace,'协作方式：'+(mode[r.binding.mode]??'未确认')]:[]),
 'DSH身份：'+(r.dsh.checked?'匹配':'未核实'),'DSH运行：'+(r.dsh.running===true?'正在运行或等待原生答复':r.dsh.running===false?'当前没有活跃执行':'未核实'),'DSH权限：'+r.dsh.permission,
 '待答技术问题：'+(r.localRecords.checked?r.localRecords.pendingTechnicalQuestions:'未核实'),'未知投递：'+(r.localRecords.checked?r.localRecords.unresolvedDeliveries:'未核实'),'持续自动路由：未部署',
 '检查异常：'+(r.blockers.length?r.blockers.map(x=>x==='DISPATCH_LOCK_PRESENT'?'有投递正在处理或遗留锁待核对':blockers[x]??'未分类核对错误').join('、'):'未发现上述连接检查异常；不等于实施验收通过'),...r.next.map(n=>'下一步：'+n)].join('\n');
}
