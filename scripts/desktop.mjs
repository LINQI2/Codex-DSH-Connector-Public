import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {spawn} from 'node:child_process';
import {root,loadConfig,validateHost} from '../src/config.mjs';
import {startService,stopService,inspectService,withStartLock} from '../src/lifecycle.mjs';
import {requestReceivingStop,receivingStatus} from '../src/receiver.mjs';
import {connect} from '../src/client.mjs';
const action=process.argv[2]??'open';if(!['open','start','status','stop'].includes(action))throw Error('仅支持open/start/status/stop');
const runtime=path.join(root,'.runtime');fs.mkdirSync(runtime,{recursive:true});const config=loadConfig();
const services=[{name:'dsh',readyFile:config.hostReadyFile,script:path.join(root,'scripts','host.mjs')},{name:'connections',readyFile:path.join(runtime,'connections-ui.json'),script:path.join(root,'scripts','connections.mjs')}].map(s=>({...s,runtime,projectRoot:root}));
if(action==='status'){console.log(JSON.stringify({services:await Promise.all(services.map(inspectService)),receiving:receivingStatus(runtime)},null,2));}
else if(action==='stop'){
 const managedFile=path.join(runtime,'managed-workspace.json');
 if(fs.existsSync(managedFile)){const m=JSON.parse(fs.readFileSync(managedFile));if(m.state!=='closed'){
  if(m.state!=='ready')throw Error('开发工作区需要恢复核对，保留服务，不按PID强杀');
  if(await(await connect({...config,hostReadyFile:m.readyFile})).hasRunningSessions())throw Error('开发工作区仍在执行或等待答复，请先在DSH客户端停止并核对；保留服务');
 }}
 requestReceivingStop(runtime);const results=[];
 // DSH must confirm it is idle before closing either service.
 const dsh=await stopService(services[0]);results.push(dsh);
 if(dsh.managed&&dsh.state!=='stopped')throw Error('DSH尚未确认关闭，保留设置页');
 results.push(await stopService(services[1]));console.log(JSON.stringify({services:results,receiving:receivingStatus(runtime),note:'不按PID强杀复用服务；原生定时器需在Codex端关闭，当前未开启'},null,2));
}else{
 const results=await withStartLock(runtime,async()=>{const out=[];for(const s of services)out.push(await startService(s));return out;});
 if(action==='open'){
  const ui=JSON.parse(fs.readFileSync(services[1].readyFile,'utf8'));const dsh=JSON.parse(fs.readFileSync(config.hostReadyFile,'utf8'));validateHost(dsh);
  if(new URL(ui.url).hostname!=='127.0.0.1')throw Error('设置页入口不符');
  // User-visible browsers, no terminal commands entered through the UI.
  for(const url of [dsh.authUrl,ui.url])await new Promise((resolve,reject)=>{const child=spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{windowsHide:true,stdio:'ignore'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('浏览器打开失败')));});
 }
 console.log(JSON.stringify({services:results,opened:action==='open',receiving:receivingStatus(runtime),modelCalls:0},null,2));
}
