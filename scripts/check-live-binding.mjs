// Explicit current-pair setup/check: no message submission or model calls.
import fs from 'node:fs';
import path from 'node:path';
import {root,loadConfig} from '../src/config.mjs';
const {url}=JSON.parse(fs.readFileSync(path.join(root,'.runtime','connections-ui.json'),'utf8'));
const origin=new URL(url).origin;
async function api(route,data){const r=await fetch(url+'api/'+route,data?{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(data)}:{});const b=await r.json();if(!r.ok)throw Error(b.error);return b;}
const c=await api('candidates');
if(c.dshError)throw Error(c.dshError);
if(c.codex.length!==1)throw Error('Codex候选不唯一，需要用户选择');
const config=loadConfig(),dsh=c.dsh.find(s=>s.sessionId===config.expectedSessionId),codex=c.codex[0];
if(!dsh)throw Error('指定DSH会话不可用');
let {binding}=await api('state');
if(binding&&(binding.codex.threadId!==codex.threadId||binding.dsh.sessionId!==dsh.sessionId))throw Error('已有其他绑定，不自动覆盖');
if(!binding)({binding}=await api('save',{revision:0,name:'原生会话连接验证',mode:'autonomous',codexThreadId:codex.threadId,codexHostId:codex.hostId,dshSessionId:dsh.sessionId}));
if(binding.state==='draft')({binding}=await api('verify',{revision:binding.revision}));
const result={checkedAt:new Date().toISOString(),codexTitle:codex.title,dshTitle:dsh.title,state:binding.state,identityChecks:binding.verification,modelCalls:0,note:'仅保存并只读核对，不自动启用，不验证消息送达或后台唤醒'};
fs.writeFileSync(path.join(root,'.runtime','live-binding-check.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
