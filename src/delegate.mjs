import fs from 'node:fs';import path from 'node:path';import {Dispatcher} from './dispatch.mjs';
const norm=p=>path.resolve(p).toLowerCase();
export async function delegate({runtime,expectedThread,expectedWorkspace,taskFile,id,send=false,clientFor}){
 if(typeof expectedThread!=='string'||!expectedThread||!expectedWorkspace||!path.isAbsolute(expectedWorkspace)||!taskFile||!path.isAbsolute(taskFile)||typeof id!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(id))throw Error('必须填写真实Codex会话、工程绝对路径、工作包绝对路径和16至80位稳定编号');
 const file=path.join(runtime,'binding.json'),b=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
 if(!b||b.codex?.hostId!=='local'||b.codex?.threadId!==expectedThread||norm(b.dsh?.workspace??'')!==norm(expectedWorkspace))throw Error('当前绑定与预期Codex或工程不符，不改绑、不发送');
 if(b.state!=='enabled'||b.mode!=='autonomous')throw Error('必须已允许连接且处于自主推进模式；CLI不能代替人工审批');
 const realRoot=fs.realpathSync(expectedWorkspace),realFile=fs.realpathSync(taskFile),relative=path.relative(realRoot,realFile);
 if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative)||!relative||!fs.statSync(realFile).isFile()||path.extname(realFile).toLowerCase()!=='.md')throw Error('工作包必须是绑定工程内的真实Markdown文件，不允许链接逃逸');
 const text='读取工作包：'+realFile+'\n按文档中制作人已经授权的范围执行，并将结果和真实验证证据写回文档指定位置。本条不新增权限或批准；若文档要求超出既有授权，停止受影响部分并明确询问。不要修改正式RRPG，不Commit/Push。';
 const preview={id,mode:send?'send':'preview',codexThreadId:expectedThread,dshSessionId:b.dsh.sessionId,workspace:b.dsh.workspace,taskFile:realFile,revision:b.revision,message:'预览不发模型；实际发送须有既有工作包授权，模式选择不是授权证明。'};
 if(!send)return preview;
 const result=await new Dispatcher(runtime,{clientFor}).send({id,text,revision:b.revision,confirmed:true},{planner:true});
 return {...preview,state:result.state,message:'原生DSH接口已受理，不代表已完成或通过。沿用该编号核对，不能重复发送。'};
}
