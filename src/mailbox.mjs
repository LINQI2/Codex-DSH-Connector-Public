import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {BindingStore} from './bindings.mjs';
export class Mailbox {
 constructor(dir){this.dir=dir;this.bindings=new BindingStore(dir);this.file=path.join(dir,'questions.json');}
 read(){return fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')):[];}
 write(rows){const tmp=this.file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(rows,null,2));fs.renameSync(tmp,this.file);}
 binding(){const b=this.bindings.read();if(!b)throw Error('尚无明确会话连接');this.bindings.assertCanSend(b.dsh.sessionId,{kind:'technical-reply'});return b;}
 submit(question,proof){
  const b=this.binding();if(typeof question.id!=='string'||!/^q-[A-Za-z0-9_-]{1,64}$/.test(question.id)||typeof question.question!=='string'||!question.question.trim()||question.question.length>6000)throw Error('问题需要稳定q-编号及6000字以内正文');
  if(!proof||proof.sessionId!==b.dsh.sessionId||typeof proof.callId!=='string')throw Error('缺少绑定Session原生工具调用证据');
  const rows=this.read(),old=rows.find(x=>x.id===question.id&&x.bindingId===b.id);
  const hash=createHash('sha256').update(question.question).digest('hex');
  if(old){if(old.hash!==hash)throw Error('同一问题编号内容冲突');return old;}
  const row={id:question.id,bindingId:b.id,codex:{threadId:b.codex.threadId,hostId:b.codex.hostId},sessionId:b.dsh.sessionId,question:question.question,hash,proof,state:'pending',createdAt:new Date().toISOString()};rows.push(row);this.write(rows);return row;
 }
 pending(){const b=this.binding();return this.read().filter(q=>q.bindingId===b.id&&q.state==='pending'&&q.codex.threadId===b.codex.threadId&&q.sessionId===b.dsh.sessionId);}
 get(id){const b=this.binding();const q=this.read().find(x=>x.id===id&&x.bindingId===b.id&&x.sessionId===b.dsh.sessionId);if(!q)throw Error('当前连接没有此问题');return q;}
 async answer(id,answer,client){
  const b=this.binding();if(typeof answer!=='string'||!answer.trim()||answer.length>8000)throw Error('答复需要8000字以内中文说明');
  const rows=this.read(),q=rows.find(x=>x.id===id&&x.bindingId===b.id&&x.sessionId===b.dsh.sessionId&&x.codex.threadId===b.codex.threadId);
  if(!q)throw Error('当前连接没有此问题');if(q.state!=='pending')throw Error('已存在答复尝试；先核对，不重复投递');
  if((await client.inspect()).running)throw Error('DSH仍在运行或等待其他工具，请结束提问回合后答复');
  q.state='answer-attempted';q.answer=answer;q.requestId='bridge-answer-'+b.id+'-'+q.id;q.attemptedAt=new Date().toISOString();this.write(rows);
  // Recheck pause/disconnect immediately before dispatch.
  this.binding();
  try{const receipt=await client.submit(q.requestId,'【Codex技术负责人答复｜关联问题 '+q.id+'】\n'+answer+'\n这是技术答复，不是制作人的新授权。请在已有范围内继续；保持原生会话可见。');q.state='accepted';q.receipt=receipt;this.write(rows);return {id:q.id,state:q.state,receipt};}
  catch(error){q.state='unknown';q.error=String(error.message);this.write(rows);throw error;}
 }
}
