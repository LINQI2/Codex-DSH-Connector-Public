import path from 'node:path';
import {root,loadConfig} from './config.mjs';
import {connect} from './client.mjs';
import {Mailbox} from './mailbox.mjs';
import {Workspaces} from './workspaces.mjs';
export async function routing(){
 const box=new Mailbox(path.join(root,'.runtime')),binding=box.binding();
 const config=new Workspaces(loadConfig()).configFor(binding.dsh);
 const client=await connect(config);
 return {box,client,binding};
}
export async function submitNativeQuestion(question){
 const {box,client,binding}=await routing();
 const page=await client.history(10);let proof;
 for(const row of page.records){const e=row.event;if(e?.type!=='assistant/message')continue;
  for(const part of e.data.message.content){if(part.type!=='tool-call'||part.name!=='mcp__codex_bridge__ask_codex')continue;
   let args;try{args=typeof part.arguments==='string'?JSON.parse(part.arguments):part.arguments;}catch{continue;}
   if(args?.id===question.id&&args?.question===question.question)proof={sessionId:binding.dsh.sessionId,callId:part.id,seq:e.seq};
  }
 }
 if(!proof)throw Error('未在准确绑定Session发现匹配的原生ask_codex调用；不接受冒称来源');
 const q=box.submit(question,proof);return {id:q.id,state:q.state,message:'技术问题已登记到绑定Codex收件箱；尚未证明Codex已读取。结束本轮等待关联答复，不轮询或重复提交。'};
}
