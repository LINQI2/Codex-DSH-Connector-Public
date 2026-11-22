import fs from 'node:fs';
import path from 'node:path';
export function receivingStatus(runtime){
 const file=path.join(runtime,'receiving.json');
 if(!fs.existsSync(file))return {state:'off',label:'未开启后台检查',detail:'单次自动验收已结束；当前没有持续模型轮询。'};
 const r=JSON.parse(fs.readFileSync(file,'utf8'));
 if(r.stopRequested)return r.automationId?{state:'stop-requested',label:'本地自动答复已停用',detail:'若原生自动化仍存在，需要在Codex自动化中停止；下一次唤醒也必须先处理停用，不答复问题。',automationId:r.automationId}:{state:'off',label:'后台接收已关闭',detail:'未登记持续原生检查，不会因打开页面自动恢复模型调用。'};
 if(r.status!=='registered'||!r.automationId||!Number.isFinite(Date.parse(r.expiresAt))||Date.now()>=Date.parse(r.expiresAt))return {state:'off',label:'后台检查已关闭或到期',detail:'不会据历史成功记录假定当前仍开启。'};
 return {state:'registered-unconfirmed',label:'已登记有界后台检查，实时状态待原生核对',detail:'间隔约'+r.intervalMinutes+'分钟；该记录不证明原生调度仍运行。',automationId:r.automationId,expiresAt:r.expiresAt};
}
export function requestReceivingStop(runtime){
 const file=path.join(runtime,'receiving.json');const old=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
 const next={...old,stopRequested:true,stopRequestedAt:new Date().toISOString()};fs.writeFileSync(file,JSON.stringify(next,null,2));return receivingStatus(runtime);
}
export function assertAutomaticReceiving(runtime){const file=path.join(runtime,'receiving.json');if(!fs.existsSync(file))throw Error('未登记有界后台接收，不自动答复');const r=JSON.parse(fs.readFileSync(file,'utf8'));if(r.stopRequested||r.status!=='registered'||!r.automationId||!Number.isFinite(Date.parse(r.expiresAt))||Date.now()>=Date.parse(r.expiresAt))throw Error('后台接收已停用或到期，不自动答复');}
