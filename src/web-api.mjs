import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {validateHost} from './config.mjs';
export async function webApi(readyFile){
 const ready=JSON.parse(fs.readFileSync(readyFile,'utf8'));validateHost(ready);
 const response=await fetch(ready.authUrl,{redirect:'manual',signal:AbortSignal.timeout(5000)});
 if(response.status!==303)throw Error('官方网页服务认证失败');
 const cookie=response.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
 if(!cookie)throw Error('没有取得本机认证');
 const rpc=async(method,args)=>{
  const r=await fetch(ready.url+'/api/'+method,{method:'POST',headers:{cookie,origin:ready.url,'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:randomUUID(),method,payload:{args}}),signal:AbortSignal.timeout(15000)});
  const b=await r.json();if(!b.result?.ok)throw Error('官方接口'+method+'失败：'+JSON.stringify(b.result?.error??b.error));return b.result.value;
 };
 // Read-only native stream; no prompt, permission change, reconnect or model call.
 rpc.followSession=(WebSocket,sessionId,{onFrame,onClose})=>{
  const streamId='connector-feedback-'+randomUUID();
  const socket=new WebSocket(ready.url.replace('http:','ws:')+'/api/remote.mux',{headers:{cookie,origin:ready.url}});
  let closed=false;
  const close=()=>{if(closed)return;closed=true;socket.terminate();};
  const failed=()=>{if(closed)return;close();onClose();};
  socket.on('open',()=>{if(!closed)socket.send(JSON.stringify({type:'open',streamId,endpoint:'session/follow',payload:{args:{request:{address:{kind:'session',sessionId},maxMessages:20}}}}));});
  socket.on('message',raw=>{if(closed)return;try{const m=JSON.parse(raw);if(m.streamId!==streamId)return;if(m.type==='item')onFrame(m.value);else if(m.type==='error'||m.type==='end')failed();}catch{failed();}});
  socket.on('error',failed);socket.on('close',failed);
  return close;
 };
 rpc.workspaceSnapshot=WebSocket=>new Promise((resolve,reject)=>{
  const socket=new WebSocket(ready.url.replace('http:','ws:')+'/api/remote.mux',{headers:{cookie,origin:ready.url}});let settled=false;
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);socket.close();error?reject(error):resolve(value);};
  const timer=setTimeout(()=>{finish(Error('原生侧栏目录读取超时，不使用旧历史冒充实时列表'));socket.terminate();},7000);
  socket.on('open',()=>socket.send(JSON.stringify({type:'open',streamId:'connector-sidebar',endpoint:'workspace/follow',payload:{args:{}}})));
  socket.on('error',e=>finish(e));socket.on('close',()=>finish(Error('原生侧栏连接提前结束')));
  socket.on('message',raw=>{try{const m=JSON.parse(raw);if(m.type==='item'&&m.value?.type==='baseline'&&Array.isArray(m.value.value?.items))finish(null,m.value.value);else if(m.type==='error'||m.type==='end')finish(Error('原生侧栏读取失败'));}catch(e){finish(e);}});
 });
 return rpc;
}
