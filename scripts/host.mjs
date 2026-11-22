// Restart only the explicitly configured, existing official validation Host.
// Never creates a Session, rewrites a profile, copies auth, or sends a prompt.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {spawn} from 'node:child_process';
import {root,loadConfig} from '../src/config.mjs';
import {connect} from '../src/client.mjs';
import {serviceControl} from '../src/service-control.mjs';
import {serviceAudit} from '../src/service-audit.mjs';
const audit=serviceAudit({runtime:path.join(root,'.runtime'),name:'dsh'});
const config=loadConfig(),h=config.officialHost;
if(!h||!path.isAbsolute(h.entry)||!path.isAbsolute(h.home)||!path.isAbsolute(h.cwd)||h.cwd!==config.expectedWorkspace||h.profile!=='probe')throw Error('缺少准确的既有验证Host启动配置');
if(!fs.existsSync(h.entry)||!fs.existsSync(path.join(h.home,'profiles',h.profile,'package.json')))throw Error('原官方安装或既有profile不存在；不自动安装或重建');
if(fs.existsSync(config.hostReadyFile))throw Error('已有Host连接信息；先核对，不能重复启动');
const env={};for(const key of ['SystemRoot','WINDIR','ComSpec','PATH','PATHEXT','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA'])if(process.env[key])env[key]=process.env[key];
Object.assign(env,{DSH_HOME:h.home,DSH_TELEMETRY_DISABLED:'1',DSH_PERMISSION_MODE:'read-only',NO_COLOR:'1'});
const child=spawn(process.execPath,[h.entry,'--profile',h.profile,'--host','127.0.0.1','--port','0','--no-open'],{cwd:h.cwd,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
let log='',stopping=false;
child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);
child.on('error',e=>{audit.record('child-error',{errorName:e.name,errorCode:e.code});console.error('官方Host启动失败：'+e.message);});
audit.record('child-spawn',{childPid:child.pid});
child.on('exit',(code,signal)=>audit.record('child-exit',{childPid:child.pid,code,signal}));
const runtime=path.join(root,'.runtime');fs.mkdirSync(runtime,{recursive:true});
function flush(){fs.writeFileSync(path.join(runtime,'dsh-host.log'),log.replace(/(token=)[^\s]+/g,'$1[REDACTED]'));}
async function stop(){if(stopping)return;stopping=true;child.kill();await Promise.race([new Promise(r=>child.once('exit',r)),new Promise(r=>setTimeout(r,5000))]);flush();if(fs.existsSync(config.hostReadyFile)){const current=JSON.parse(fs.readFileSync(config.hostReadyFile,'utf8'));if(current.pid===child.pid)fs.unlinkSync(config.hostReadyFile);}process.exit(0);}
process.on('SIGINT',()=>{audit.requestStop('SIGINT');stop();});process.on('SIGTERM',()=>{audit.requestStop('SIGTERM');stop();});
let authUrl;
for(let i=0;i<180;i++){authUrl=log.match(/https?:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+/)?.[0];if(authUrl)break;if(child.exitCode!==null)break;await new Promise(r=>setTimeout(r,250));}
if(!authUrl){flush();child.kill();throw Error('官方Host未在45秒内就绪；查看私有脱敏日志，不自动重试');}
fs.writeFileSync(config.hostReadyFile,JSON.stringify({authUrl,url:new URL(authUrl).origin,pid:child.pid,wrapperPid:process.pid,startedAt:new Date().toISOString()}));flush();
console.log('既有官方DSH验证Host已就绪；保留原home和Session，未调用模型。连接信息保存在本项目.runtime。');
await serviceControl({runtime,name:'dsh',stop,onStopRequest:()=>audit.requestStop('control-api'),canStop:async()=>{const client=await connect(config);if(await client.hasRunningSessions())throw Error('官方Host存在执行中或待答的DSH会话；先在原生界面结束，不强制关闭');}});
audit.record('service-ready');
child.once('exit',()=>{if(!stopping){audit.requestStop('child-exit');stop();}});
// Explicitly controlled lifetime; no surprise one-hour shutdown.
