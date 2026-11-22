import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {root} from '../src/config.mjs';
import {serviceControl} from '../src/service-control.mjs';
import {startService,stopService,inspectService,withStartLock,processAlive} from '../src/lifecycle.mjs';
test('Windows EPERM：进程清单确认已退出才允许恢复启动',()=>{
 const probe=()=>{throw Object.assign(Error('denied'),{code:'EPERM'});};
 assert.equal(processAlive(8408,{platform:'win32',probe,windowsProbe:()=> 'absent'}),false);
 assert.equal(processAlive(8408,{platform:'win32',probe,windowsProbe:()=> 'present'}),true);
 for(const windowsProbe of [()=> 'unknown',()=>{throw Error('CIM unavailable');}])assert.throws(()=>processAlive(8408,{platform:'win32',probe,windowsProbe}),/PID 8408.*EPERM/);
 assert.throws(()=>processAlive(8408,{platform:'linux',probe,windowsProbe:()=> 'absent'}),/EPERM/);
});
test('进程探测：ESRCH明确退出，其他错误不得当作退出',()=>{
 assert.equal(processAlive(1,{probe:()=>{throw Object.assign(Error(),{code:'ESRCH'});}}),false);
 assert.equal(processAlive(1,{probe:()=>{}}),true);
 assert.equal(processAlive(-1),false);
 assert.throws(()=>processAlive(1,{probe:()=>{throw Object.assign(Error(),{code:'EACCES'});}}),/EACCES/);
});
function temp(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'native-lifecycle-test-'));t.after(()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep+'native-lifecycle-test-'));fs.rmSync(dir,{recursive:true});});return dir;}
test('Windows旧PID已属于无关进程：仅归档失效记录，不杀进程', {skip:process.platform!=='win32'},async t=>{
 const dir=temp(t),readyFile=path.join(dir,'dsh-host.json');fs.writeFileSync(path.join(dir,'dsh-control.json'),JSON.stringify({name:'dsh',owner:'codex-dsh-connector',pid:process.pid,url:'http://127.0.0.1:1/'+'a'.repeat(48)}));fs.writeFileSync(readyFile,JSON.stringify({pid:process.pid,wrapperPid:process.pid,url:'http://127.0.0.1:1'}));
 const result=await inspectService({runtime:dir,name:'dsh',readyFile});assert.equal(result.state,'stopped');process.kill(process.pid,0);assert.equal(fs.readdirSync(path.join(dir,'stale-startup-records')).length,2);
});
test('运行中服务拒绝关闭、外部来源被拒绝',async t=>{
 const dir=temp(t),c=await serviceControl({runtime:dir,name:'test',stop:async()=>{},canStop:async()=>{throw Error('仍有运行任务');}});t.after(()=>c.close());
 const r=JSON.parse(fs.readFileSync(path.join(dir,'test-control.json'),'utf8'));
 assert.equal((await fetch(r.url,{method:'POST'})).status,409);
 assert.equal((await fetch(r.url,{headers:{origin:'https://foreign.example'}})).status,403);
});
test('启动锁防重复，不遗留锁',async t=>{
 const dir=temp(t);let release;const p=withStartLock(dir,()=>new Promise(r=>release=r));await new Promise(r=>setImmediate(r));assert.throws(()=>withStartLock(dir,async()=>{}),/已有启动/);release();await p;assert.equal(fs.existsSync(path.join(dir,'launcher.lock')),false);
});
test('真实受管子进程启动、复用、安全关闭；无模型',async t=>{
 const dir=temp(t),script=path.join(dir,'worker.mjs'),readyFile=path.join(dir,'ready.json');
 const source='import {serviceControl} from '+JSON.stringify(pathToFileURL(path.join(root,'src','service-control.mjs')).href)+'; import fs from "node:fs"; const runtime='+JSON.stringify(dir)+'; await serviceControl({runtime,name:"test",stop:async()=>process.exit(0)});fs.writeFileSync('+JSON.stringify(readyFile)+',JSON.stringify({pid:process.pid,url:"http://127.0.0.1:1"}));';fs.writeFileSync(script,source);
 const options={runtime:dir,name:'test',readyFile,script,projectRoot:dir};
 const first=await startService(options);assert.equal(first.managed,true);assert.equal(first.reused,false);
 const again=await startService(options);assert.equal(again.pid,first.pid);assert.equal(again.reused,true);
 assert.equal((await stopService(options)).state,'stopped');assert.equal((await inspectService(options)).state,'stopped');
});
