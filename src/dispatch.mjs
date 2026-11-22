import fs from 'node:fs';
import path from 'node:path';
import {BindingStore} from './bindings.mjs';
import {hasDevelopmentAccess} from './permission-view.mjs';
export class Dispatcher{
 constructor(runtime,{clientFor}){this.runtime=runtime;this.clientFor=clientFor;this.store=new BindingStore(runtime);this.dir=path.join(runtime,'dispatches');fs.mkdirSync(this.dir,{recursive:true});}
 async send(input,options={}){
  const lock=path.join(this.runtime,'dispatch.lock');let fd;
  try{fd=fs.openSync(lock,'wx');}catch(error){if(error.code==='EEXIST')throw Error('正在投递或上次投递锁待核对，不并发重复发送');if(['EACCES','EPERM'].includes(error.code))throw Error('连接器运行目录写入被拒绝：无法创建投递锁。请通过原生审批申请在普通用户宿主运行本次连接器命令；不是已有投递，也未发送模型消息',{cause:error});throw error;}
  try{fs.writeFileSync(fd,JSON.stringify({pid:process.pid,at:new Date().toISOString()}));return await this.sendUnlocked(input,options);}finally{fs.closeSync(fd);fs.unlinkSync(lock);}
 }
 async sendUnlocked({id,text,revision,confirmed},{planner=false}={}){
  if(confirmed!==true)throw Error('请先检查内容并明确确认发送');
  if(typeof id!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(id))throw Error('缺少稳定的发送编号');
  if(typeof text!=='string'||!text.trim()||text.length>8000)throw Error('请填写8000字以内的明确任务');
  const b=this.store.assertRevision(revision);if(!b)throw Error('请先选择并启用连接');
  if(planner&&b.mode!=='autonomous')throw Error('当前不是自主委派模式；需要制作人在页面确认，CLI不代替批准');
  const questionsFile=path.join(this.runtime,'questions.json');
  if(fs.existsSync(questionsFile)&&JSON.parse(fs.readFileSync(questionsFile,'utf8')).some(q=>q.bindingId===b.id&&q.sessionId===b.dsh.sessionId&&['unknown','answer-attempted'].includes(q.state)))throw Error('当前绑定有答复投递待核对，不发送新任务');
  for(const name of fs.readdirSync(this.dir)){const old=JSON.parse(fs.readFileSync(path.join(this.dir,name),'utf8'));if(old.sessionId===b.dsh.sessionId&&['attempted','unknown'].includes(old.state))throw Error('此会话有待核对的投递，不发送新任务；先核对原生记录');}
  // UI submission confirms a new package; planner CLI must already be in autonomous mode.
  const kind=planner?'new-task':'confirmed-new-task';
  this.store.assertCanSend(b.dsh.sessionId,{kind});
  const file=path.join(this.dir,id+'.json');if(fs.existsSync(file))throw Error('该发送已有记录，请核对原生会话，不重复派发');
  const client=await this.clientFor(b.dsh),session=await client.inspect();if(session.running||await client.hasRunningWorkspace())throw Error('DSH当前执行或等待中，请在原生客户端补充或停止，不重复派发');
  if(planner&&!hasDevelopmentAccess(session.projections?.values?.permissions?.currentValue))throw Error('DSH原生会话尚未确认项目读写权限：仅查看或未知模式不能投递开发委派；用户已选择的完整访问同样支持');
  this.store.assertRevision(revision);this.store.assertCanSend(b.dsh.sessionId,{kind});
  const row={id,bindingId:b.id,sessionId:b.dsh.sessionId,workspace:b.dsh.workspace,submittedVia:planner?'planner-cli':'producer-ui',text:text.trim(),state:'attempted',at:new Date().toISOString()};
  // Optional passive statistics boundary. Missing projections never block sending.
  if(Number.isSafeInteger(session.projections?.asOfSeq))row.evaluationBoundary={seq:session.projections.asOfSeq,usage:session.projections?.values?.tokenUsage??null};
  if(b.codex?.hostId==='local'&&b.codex.cwd)row.codexTarget={threadId:b.codex.threadId,hostId:b.codex.hostId,cwd:b.codex.cwd};
  fs.writeFileSync(file,JSON.stringify(row,null,2),{flag:'wx'});
  try{row.receipt=await client.submit('connector-task-'+id,'【通过连接器明确提交的任务｜范围以既有授权为准】\n'+row.text+'\n请保持简体中文交流，只在当前已授权目录和工具权限内执行。具体工具结果与验证须如实汇报，接受消息不等于任务完成。');row.state='accepted';fs.writeFileSync(file,JSON.stringify(row,null,2));return {id,state:row.state,message:'DSH接口已受理；请打开原生客户端查看执行。这不代表任务已完成。'};}
  catch(error){row.state='unknown';row.error=error.message;fs.writeFileSync(file,JSON.stringify(row,null,2));throw Error('投递结果待核对，禁止重复发送：'+error.message);}
 }
}
