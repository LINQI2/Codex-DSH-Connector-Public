// Private loopback control for this project's exact owned child services.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {randomBytes} from 'node:crypto';
export async function serviceControl({runtime,name,stop,canStop=async()=>true,onStopRequest=()=>{}}){
 const key=randomBytes(24).toString('hex'),file=path.join(runtime,name+'-control.json');
 const server=http.createServer(async(req,res)=>{
  const host='127.0.0.1:'+server.address().port;
  if(req.headers.host!==host||req.url!=='/'+key||req.headers.origin){res.writeHead(403);return res.end();}
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  if(req.method==='GET')return res.end(JSON.stringify({name,pid:process.pid,owner:'codex-dsh-connector'}));
  if(req.method!=='POST'){res.writeHead(405);return res.end();}
  try{await canStop();}catch(error){res.writeHead(409);return res.end(JSON.stringify({error:error.message}));}
  try{onStopRequest();}catch{}res.end(JSON.stringify({stopping:true}));setImmediate(async()=>{await close();await stop();});
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 fs.writeFileSync(file,JSON.stringify({name,pid:process.pid,owner:'codex-dsh-connector',url:'http://127.0.0.1:'+server.address().port+'/'+key,startedAt:new Date().toISOString()}));
 async function close(){if(fs.existsSync(file)){const r=JSON.parse(fs.readFileSync(file,'utf8'));if(r.pid===process.pid)fs.unlinkSync(file);}server.closeAllConnections();await new Promise(r=>server.close(r));}
 return {close};
}
export async function readControl(file,name){
 if(!fs.existsSync(file))return null;
 const r=JSON.parse(fs.readFileSync(file,'utf8')),u=new URL(r.url);
 if(r.owner!=='codex-dsh-connector'||r.name!==name||u.protocol!=='http:'||u.hostname!=='127.0.0.1'||!/^\/[a-f0-9]{48}$/.test(u.pathname))throw Error('服务控制记录不匹配');
 const response=await fetch(u,{signal:AbortSignal.timeout(3000)}),live=await response.json();
 if(!response.ok||live.pid!==r.pid||live.name!==name||live.owner!==r.owner)throw Error('服务控制身份核对失败');return r;
}
