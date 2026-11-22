import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
const modes=['autonomous','confirm-new','paused'];
export class BindingStore {
 constructor(dir){this.dir=dir;this.file=path.join(dir,'binding.json');fs.mkdirSync(dir,{recursive:true});}
 read(){return fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')):null;}
 write(next){const tmp=this.file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(next,null,2));fs.renameSync(tmp,this.file);fs.appendFileSync(path.join(this.dir,'binding-audit.jsonl'),JSON.stringify({at:next.updatedAt,id:next.id,revision:next.revision,state:next.state})+'\n');return next;}
 assertRevision(expected){const current=this.read();if((current?.revision??0)!==expected)throw Error('页面内容已变化，请刷新后重试');return current;}
 save(input,expected){const old=this.assertRevision(expected);if(typeof input.name!=='string'||!input.name.trim()||input.name.length>100)throw Error('请填写100字以内的连接名称');if(!modes.includes(input.mode))throw Error('请选择有效协作方式');if(!input.codex?.threadId||!input.codex?.hostId||!input.dsh?.sessionId||!input.dsh?.workspace)throw Error('请选择双方会话');return this.write({id:old?.id??randomUUID(),name:input.name.trim(),codex:input.codex,dsh:input.dsh,mode:input.mode,state:'draft',verification:null,revision:(old?.revision??0)+1,updatedAt:new Date().toISOString()});}
 verify(result,expected){const b=this.assertRevision(expected);if(!b||b.state==='disconnected')throw Error('请先保存连接');if(!result.codexIdentity||!result.dshIdentity)throw Error('双方身份核对尚未通过');return this.write({...b,state:'verified',verification:{...result,checkedAt:new Date().toISOString(),codexDelivery:false,dshDelivery:false,backgroundRouter:false},revision:b.revision+1,updatedAt:new Date().toISOString()});}
 transition(action,expected){const b=this.assertRevision(expected);if(!b)throw Error('请先保存连接');if(!['enable','pause','disconnect'].includes(action))throw Error('未知操作');if(action==='enable'){
 if(!['verified','paused'].includes(b.state)||!b.verification)throw Error('请先检查双方身份');
 if(b.mode==='paused')throw Error('当前方式为暂停委派，请修改方式并重新检查');
 }return this.write({...b,state:{enable:'enabled',pause:'paused',disconnect:'disconnected'}[action],verification:action==='disconnect'?null:b.verification,revision:b.revision+1,updatedAt:new Date().toISOString()});}
 assertCanSend(sessionId,{kind='new-task'}={}){const b=this.read();if(!b)return; if(b.state!=='enabled'||b.mode==='paused')throw Error('连接未启用或已暂停；不发送新消息');if(b.dsh.sessionId!==sessionId)throw Error('发送目标与已绑定会话不一致');if(b.mode==='confirm-new'&&!['technical-reply','confirmed-new-task'].includes(kind))throw Error('当前要求新委派先确认，配置命令不代替真人批准');}
}
