export const feedbackTool={name:'wait_dsh_feedback',description:'等待已绑定DSH的新反馈，默认最多15分钟。等待发生在本地程序，不持续调用模型。仅在技术提问、原生批准、本轮结束、断线或到时返回；不发送任务、不批准、不改变权限。派发后优先使用本工具代替循环status。idle须处理而非反复等待，turn-ended不等于验收完成。',inputSchema:{type:'object',properties:{codexThreadId:{type:'string'},workspace:{type:'string'},waitSeconds:{type:'integer',minimum:1,maximum:900,default:900},afterSeq:{type:'integer',minimum:0}},required:['codexThreadId','workspace'],additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}};

// Requests are not serialized behind the wait: ping and cancellation remain live.
export function plannerWaitHandler({wait,reply}){
 const active=new Map();
 const respond=(id,result)=>reply({jsonrpc:'2.0',id,result});
 const error=(id,code,message)=>reply({jsonrpc:'2.0',id,error:{code,message}});
 return {
  close(){for(const c of active.values())c.abort();},
  async handle(msg){
   if(msg?.method==='notifications/cancelled'){active.get(msg.params?.requestId)?.abort();return;}
   if(msg?.id===undefined)return;
   if(msg.method==='initialize')return respond(msg.id,{protocolVersion:['2024-11-05','2025-03-26','2025-06-18'].includes(msg.params?.protocolVersion)?msg.params.protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'connector-feedback-wait',version:'0.1.0'},instructions:'只读等待已绑定DSH，不提供Shell或任务发送。'});
   if(msg.method==='ping')return respond(msg.id,{});
   if(msg.method==='tools/list')return respond(msg.id,{tools:[feedbackTool]});
   if(msg.method!=='tools/call'||msg.params?.name!==feedbackTool.name)return error(msg.id,-32601,'Method not found');
   const a=msg.params.arguments;
   if(!a||typeof a.codexThreadId!=='string'||typeof a.workspace!=='string'||
      Object.keys(a).some(k=>!['codexThreadId','workspace','waitSeconds','afterSeq'].includes(k))||
      (a.waitSeconds!==undefined&&(!Number.isInteger(a.waitSeconds)||a.waitSeconds<1||a.waitSeconds>900))||
      (a.afterSeq!==undefined&&(!Number.isInteger(a.afterSeq)||a.afterSeq<0)))return error(msg.id,-32602,'等待参数无效');
   if(active.size)return respond(msg.id,{isError:true,content:[{type:'text',text:'已有等待请求；不要重复建立监听。'}]});
   const controller=new AbortController();active.set(msg.id,controller);
   try{const value=await wait({expectedThread:a.codexThreadId,expectedWorkspace:a.workspace,waitMs:(a.waitSeconds??900)*1000,afterSeq:a.afterSeq,signal:controller.signal});respond(msg.id,{content:[{type:'text',text:JSON.stringify(value)}]});}
   catch{respond(msg.id,{isError:true,content:[{type:'text',text:'等待未建立，请核对绑定、原生服务及参数；未发送消息，私有异常未输出。'}]});}
   finally{active.delete(msg.id);}
  }
 };
}
