const csvCell=v=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
export function exportCsv(rows){
 const headers=['任务','工作方式','观察起点','观察结束','本模块观察历时毫秒','Codex执行毫秒','Codex已测Token','Codex数据覆盖','Codex估算金额','Codex币种','DSH执行毫秒','DSH已测Token','DSH数据覆盖','DSH估算金额','DSH币种'];
 return '\ufeff'+[headers,...rows.map(t=>{const c=t.providers?.codex,d=t.providers?.dsh;return [t.title,t.mode,t.createdAt,t.closedAt,t.elapsedMs,c?.executionMs,c?.usage?.totalTokens,c?.coverage,c?.estimate?.amount,c?.estimate?.currency,d?.executionMs??t.executionMs,d?.usage?.totalTokens??t.usage?.totalTokens,d?.coverage??t.coverage,d?.estimate?.amount??t.estimate?.amount,d?.estimate?.currency??t.estimate?.currency];})].map(r=>r.map(csvCell).join(',')).join('\r\n');
}
export async function evaluationAction(e,input){
 if(input.action==='register')return e.collector.register({title:input.title,sessionId:input.sessionId,workspace:input.workspace,mode:input.mode,codex:input.codex});
 if(input.action==='link-codex'){await e.collector.linkCodex(input.id,input.codex);return {message:'Codex会话已关联；从当前基线统计，不回填此前用量'};}
 if(input.action==='resume')return e.collector.resume(input.id);
 if(input.action==='finish')return e.collector.finish(input.id);
 if(input.action==='price'){if(input.provider!==undefined&&!['codex','dsh'].includes(input.provider))throw Error('请选择正确的计价工具，不将未知工具价格套给DSH');if(input.provider==='codex')e.store.setCodexPrice(input.id,input.price);else e.store.setPrice(input.id,input.price);return {message:'估算单价已保存；不是实际账单，也不授予模型调用权限'};}
 throw Error('没有此评估操作');
}
