import fs from 'node:fs';import path from 'node:path';import process from 'node:process';import {randomUUID} from 'node:crypto';
// Event-only audit: no timers, no model requests, no raw error messages or URLs.
export function serviceAudit({runtime,name,processRef=process,maxBytes=1024*1024}){
 if(!/^[a-z0-9-]{1,40}$/.test(name))throw Error('Invalid audit service name');
 const dir=path.join(runtime,'service-audit'),file=path.join(dir,name+'.jsonl'),stateFile=path.join(dir,name+'-last.json');
 const runId=randomUUID();let reason=null,fault=false,warning=false;
 const safe=fn=>{try{return fn();}catch{if(!warning){warning=true;console.error('服务诊断日志暂不可写；不影响原有执行。');}return false;}};
 const record=(event,data={})=>safe(()=>{
  fs.mkdirSync(dir,{recursive:true});if(fs.existsSync(file)&&fs.statSync(file).size>=maxBytes){if(fs.existsSync(file+'.3'))fs.unlinkSync(file+'.3');for(let i=2;i>=1;i--)if(fs.existsSync(file+'.'+i))fs.renameSync(file+'.'+i,file+'.'+(i+1));fs.renameSync(file,file+'.1');}
  const fields={};for(const k of ['previousPid','previousStartedAt','previousStatus','code','signal','errorName','errorCode','childPid','reason','cleanShutdown','reused'])if(data[k]!==undefined)fields[k]=typeof data[k]==='string'?data[k].slice(0,120):data[k];
  fs.appendFileSync(file,JSON.stringify({at:new Date().toISOString(),service:name,runId,pid:processRef.pid,parentPid:processRef.ppid,event,...fields})+'\n');return true;
 });
 const save=status=>safe(()=>{fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(stateFile,JSON.stringify({runId,pid:processRef.pid,startedAt,status,reason,fault,updatedAt:new Date().toISOString()}));return true;});
 const previous=safe(()=>fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')):null);
 const startedAt=new Date().toISOString();
 if(previous&&previous.status!=='exited')record('previous-end-not-recorded',{previousPid:previous.pid,previousStartedAt:previous.startedAt,previousStatus:previous.status});
 record('process-start');save('running');
 const requestStop=value=>{if(!reason){reason=value;record('shutdown-requested',{reason});save('stopping');}};
 const onFault=e=>{fault=true;record('uncaught-exception',{errorName:e?.name,errorCode:e?.code});};
 const onExit=code=>{record('process-exit',{code,reason:reason??'unrequested',cleanShutdown:code===0&&!fault&&['control-api','SIGINT','SIGTERM'].includes(reason)});save('exited');};
 processRef.on('uncaughtExceptionMonitor',onFault);processRef.on('exit',onExit);
 return {record,requestStop,dispose:()=>{processRef.removeListener('uncaughtExceptionMonitor',onFault);processRef.removeListener('exit',onExit);}};
}
