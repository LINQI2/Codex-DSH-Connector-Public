import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {spawn,execFileSync} from 'node:child_process';
import {readControl} from './service-control.mjs';
function windowsProcessExists(pid){
 // Windows kill(pid, 0) can return EPERM for an already exited PID.
 // Only a successful, exact process inventory may resolve that ambiguity.
 const query="$ErrorActionPreference='Stop'; $p=Get-CimInstance Win32_Process -Filter 'ProcessId = "+pid+"'; if($null -eq $p){'absent'}else{'present'}";
 return execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',query],{windowsHide:true,encoding:'utf8',timeout:5000}).trim();
}
export function processAlive(pid,{platform=process.platform,probe=id=>process.kill(id,0),windowsProbe=windowsProcessExists}={}){
 if(!Number.isInteger(pid)||pid<1)return false;
 try{probe(pid);return true;}catch(e){
  if(e.code==='ESRCH')return false;
  if(platform==='win32'&&e.code==='EPERM'){
   try{const state=windowsProbe(pid);if(state==='absent')return false;if(state==='present')return true;}catch{}
  }
  throw Error('无法核对服务进程（PID '+pid+'，'+(e.code??'未知错误')+'）；Windows进程清单也未能确认，请保留现场，不自动重复启动',{cause:e});
 }
}
function definitelyReused(pid,name,runtime){
 if(process.platform!=='win32'||!['dsh','connections'].includes(name)||!Number.isInteger(pid)||pid<1)return false;
 const script=path.join(path.dirname(runtime),'scripts',name==='dsh'?'host.mjs':'connections.mjs').replaceAll("'","''");
 try{const query="$p=Get-CimInstance Win32_Process -Filter 'ProcessId = "+pid+"'; if($p -and $p.CommandLine){if($p.Name -ne 'node.exe' -or $p.CommandLine.IndexOf('"+script+"',[StringComparison]::OrdinalIgnoreCase) -lt 0){'different'}else{'matching'}}else{'unknown'}";
  return execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',query],{windowsHide:true,encoding:'utf8',timeout:5000}).trim()==='different';
 }catch{return false;}
}
function archiveStale(file,runtime){if(path.dirname(path.resolve(file))!==path.resolve(runtime))throw Error('失效记录不在本项目runtime');const archive=path.join(runtime,'stale-startup-records');fs.mkdirSync(archive,{recursive:true});fs.renameSync(file,path.join(archive,path.basename(file)+'.'+Date.now()+'.'+Math.random().toString(16).slice(2)));}
export async function inspectService({runtime,name,readyFile}){
 const controlFile=path.join(runtime,name+'-control.json');
 if(fs.existsSync(controlFile)){
  const recorded=JSON.parse(fs.readFileSync(controlFile,'utf8'));
  try{const control=await readControl(controlFile,name);return {name,state:'running',managed:true,pid:control.pid};}
  catch(error){if(processAlive(recorded.pid)&&!definitelyReused(recorded.pid,name,runtime))throw Error(name+'已有进程但控制接口不可用：'+error.message);archiveStale(controlFile,runtime);}
 }
 if(!fs.existsSync(readyFile))return {name,state:'stopped',managed:false};
 const ready=JSON.parse(fs.readFileSync(readyFile,'utf8'));
 const u=new URL(name==='dsh'?ready.url:ready.url);
 if(u.protocol!=='http:'||u.hostname!=='127.0.0.1')throw Error('服务入口不是准确回环地址');
 try{
  const response=await fetch(u,{signal:AbortSignal.timeout(3000)});
  if((name==='dsh'&&[200,401].includes(response.status))||(name==='connections'&&response.ok))return {name,state:'running',managed:false,pid:ready.wrapperPid??ready.pid};
 }catch{}
 if(processAlive(ready.wrapperPid??ready.pid)&&!(ready.wrapperPid&&definitelyReused(ready.wrapperPid,name,runtime)))throw Error(name+'仍有进程但网页不可达；不重复启动或强杀');
 if(path.dirname(path.resolve(readyFile))!==path.resolve(runtime))throw Error('失效记录不在本项目runtime，不删除');
 archiveStale(readyFile,runtime);return {name,state:'stopped',managed:false};
}
export async function startService({runtime,name,readyFile,script,projectRoot}){
 const prior=await inspectService({runtime,name,readyFile});if(prior.state==='running')return {...prior,reused:true};
 const log=fs.openSync(path.join(runtime,name+'-launcher.log'),'a');let child;
 try{child=spawn(process.execPath,[script],{cwd:projectRoot,windowsHide:true,detached:true,stdio:['ignore',log,log]});await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});}finally{fs.closeSync(log);}
 child.unref();
 for(let i=0;i<180;i++){
  if(fs.existsSync(readyFile)&&fs.existsSync(path.join(runtime,name+'-control.json')))return {...await inspectService({runtime,name,readyFile}),reused:false};
  if(!processAlive(child.pid))throw Error(name+'启动退出；查看本机启动日志，不自动重试');
  await new Promise(r=>setTimeout(r,250));
 }
 throw Error(name+'启动未在45秒内就绪；保留现场，不盲目再启动');
}
export async function stopService({runtime,name,readyFile}){
 const status=await inspectService({runtime,name,readyFile});
 if(status.state==='stopped')return status;
 if(!status.managed)return {...status,stopped:false,reason:'复用的旧服务没有本项目控制接口，保留它，不按PID强杀'};
 const control=await readControl(path.join(runtime,name+'-control.json'),name);
 const response=await fetch(control.url,{method:'POST',signal:AbortSignal.timeout(10000)});const result=await response.json();
 if(!response.ok)throw Error(result.error??'服务拒绝关闭');
 for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,100));if(!processAlive(control.pid))return {name,state:'stopped',managed:true,stopped:true};}
 return {name,state:'stopping',managed:true,stopped:false,reason:'已请求关闭，尚未证实进程退出，不强杀'};
}
export function withStartLock(runtime,fn){
 const file=path.join(runtime,'launcher.lock');
 if(fs.existsSync(file)){const pid=Number(fs.readFileSync(file,'utf8'));if(processAlive(pid))throw Error('已有启动操作进行中，请勿重复点击');fs.unlinkSync(file);}
 fs.writeFileSync(file,String(process.pid),{flag:'wx'});
 return Promise.resolve().then(fn).finally(()=>{if(fs.existsSync(file)&&Number(fs.readFileSync(file,'utf8'))===process.pid)fs.unlinkSync(file);});
}
