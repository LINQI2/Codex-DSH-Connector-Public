// One bounded task in the approved fixture using the installed official SDK.
// A separate profile preserves the original Web Session's read-only config.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {root,loadConfig} from '../src/config.mjs';
const config=loadConfig(),fixture=path.join(root,'fixtures','file-task-20261031'),out=path.join(root,'.runtime','file-task-evidence'),temp=path.join(root,'.runtime','file-task-temp','dsh-task-20261031');
const resume=process.argv.includes('--resume'),priorFile=path.join(out,'sdk-run.json'),prior=resume?JSON.parse(fs.readFileSync(priorFile,'utf8')):null;
if(resume&&(prior.phase!=='finished'||prior.processExit?.exitCode!==0||prior.before!==prior.after))throw Error('前次任务未证实结束且未修改，不自动续接');
const stateFile=path.join(out,resume?'sdk-resume-1.json':'sdk-run.json');if(fs.existsSync(stateFile))throw Error('已有本次真实任务投递记录；不盲重跑，先核对');
if(!fs.existsSync(path.join(out,'before-metadata.json')))throw Error('没有限定权限准备证据');
const profile='connector-file-task-20261031',profileDir=path.join(config.officialHost.home,'profiles',profile);
if(!resume&&fs.existsSync(profileDir))throw Error('独立任务profile已存在；先核对，不覆盖');
if(!resume){
fs.mkdirSync(profileDir,{recursive:true});
fs.writeFileSync(path.join(profileDir,'package.json'),JSON.stringify({private:true,dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-sdk-app']}}}));
fs.writeFileSync(path.join(profileDir,'cordis.patch.yml'),'- id: sdk-app-startup\n  config:\n    profile: '+profile+'\n- id: approval\n  config:\n    policy: never\n- id: permission\n  config:\n    defaultPreset: fixture-write\n    presets:\n      fixture-write:\n        sandbox: workspace-write\n        approval: never\n- id: sandbox-policy\n  config:\n    mode: workspace-write\n    workspaceRoot: '+JSON.stringify(fixture)+'\n- id: fs-sandbox\n  config:\n    cwd: '+JSON.stringify(fixture)+'\n'+['tool-bash','tool-jobs','tool-goal','tool-web','tool-subagent','tool-subagent-fork','tool-subagent-control','tool-subagent-list-agents','tool-workflow'].map(id=>'- id: '+id+'\n  disabled: true\n').join(''));
}
const protocol=path.resolve(path.dirname(config.officialHost.entry),'../../dsh-sdk-protocol/lib/index.js');
const {JsonRpcLineTransport}=await import(pathToFileURL(protocol).href);
const env={};for(const k of ['SystemRoot','WINDIR','ComSpec','PATH','PATHEXT','USERPROFILE','APPDATA','LOCALAPPDATA'])if(process.env[k])env[k]=process.env[k];
Object.assign(env,{DSH_HOME:config.officialHost.home,DSH_PERMISSION_MODE:'workspace-write',DSH_TELEMETRY_DISABLED:'1',DSH_MAX_TOKENS_AS_SUCCESS:'false',TEMP:temp,TMP:temp});
const sessionId=prior?.sessionId??'connector-file-'+randomUUID();const hash=p=>createHash('sha256').update(fs.readFileSync(path.join(fixture,p))).digest('hex');
const state={sessionId,profile,workspace:fixture,phase:'starting',startedAt:new Date().toISOString(),protected:{'summary.test.mjs':hash('summary.test.mjs'),'README.md':hash('README.md')},before:hash('summary.mjs')};
const save=()=>fs.writeFileSync(stateFile,JSON.stringify(state,null,2));save();
const child=spawn(process.execPath,[config.officialHost.entry,'--profile',profile],{cwd:fixture,env,windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});
const rpc=new JsonRpcLineTransport(child.stdout,child.stdin);
rpc.onNotification((method,params)=>{fs.appendFileSync(path.join(out,'sdk-events.jsonl'),JSON.stringify({at:new Date().toISOString(),method,params})+'\n');const e=params?.event;if(e?.type==='tool/call')console.log('DSH工具：'+e.data.name);if(e?.type==='tool/result'){const m=e.data.message;console.log('DSH工具结果：'+(m?.isError?'错误':'已返回'));}});
rpc.onRequest(async()=>{throw Error('本任务不授权额外权限或交互批准');});child.stderr.on('data',b=>fs.appendFileSync(path.join(out,'sdk-stderr.log'),b));child.on('error',()=>rpc.close());child.on('exit',()=>rpc.close());child.stdin.on('error',()=>rpc.close());rpc.start();
try{
 state.initialize=await rpc.request('initialize',{cwd:fixture,provider:'deepseek-account',model:'deepseek-flash',reasoningEffort:'low'},AbortSignal.timeout(45000));state.phase='initialized';save();
 const instruction='你是Codex委派的独立文件任务执行者，默认简体中文。只允许访问和修改当前实验目录 '+fixture+'，不要读取父目录、账号资料、网络或其他工程，不安装依赖、不改权限、不提交Git、不创建子Agent或Goal。原生受限Shell workspace-write / never已按授权准备，不能申请扩大权限。任务：修复summary.mjs的summarizeQuestions，使本目录既定summary.test.mjs全部通过。它用于连接器真实收件箱统计，必须区分pending/accepted/unknown，不能把受理当完成，暂停时仍保留数量。只改summary.mjs，保护README.md和summary.test.mjs不变。执行顺序：先用pwsh运行一条最小只读命令并取得退出码（例如Get-Location）；读取本目录源码和测试；运行node --test summary.test.mjs取得真实红测；使用原生edit/write工具修复；再次运行同样测试取得绿测。最多3次测试执行，不循环重试权限错误。若出现权限/沙箱错误，说明确切错误并停止，禁止无隔离或其他工具绕过。完成后中文汇报实际修改、真实通过/失败数量及未验证项，不以口头描述替代执行证据。';
 if(resume){state.resume=await rpc.request('session/resume',{sessionId},AbortSignal.timeout(30000));save();}
 const effectiveInstruction=resume?'【Codex技术负责人：原任务核对后续接】前次已证实结束、无文件修改、SDK正常shutdown。Node测试运行器每文件子进程隔离与受限环境不兼容。保持原Windows沙箱/never及3项断言不变，改用同一已安装Node的单进程测试选项：& '+JSON.stringify(process.execPath)+' --test --test-isolation=none summary.test.mjs。仅取消Node框架额外测试子进程，不取消OS沙箱，不降低断言。请同一原Session继续：先用此命令取得真正断言红测，原生edit/write只修summary.mjs，再用完全相同命令取得绿测。保护测试和README，不读写外部、不联网、不改权限、不新建任务。README中的权限等待段是历史准备状态，本轮显式授权覆盖执行但不修改该文档。最多2次此测试命令；若仍有原生执行错误，精确报告停止，不换执行器绕过。中文汇报真实文件修改和通过/失败项。':instruction;
 state.phase='prompt-attempted';save();state.receipt=await rpc.request('session/prompt',{sessionId,contentBlocks:[{type:'text',text:effectiveInstruction}]},AbortSignal.timeout(30000));state.phase='running';save();console.log('真实DSH任务已接收，Session '+sessionId);
 state.result=await rpc.request('session/wait',{sessionId},AbortSignal.timeout(60*60*1000));state.phase='finished';state.after=hash('summary.mjs');state.protectedUnchanged=Object.entries(state.protected).every(([p,h])=>hash(p)===h);save();console.log(JSON.stringify({phase:state.phase,result:state.result,sourceChanged:state.before!==state.after,protectedUnchanged:state.protectedUnchanged}));
}catch(error){state.phase='blocked-or-unknown';state.error=String(error.message);save();console.error(state.error);process.exitCode=1;}
finally{try{await rpc.request('shutdown',{},AbortSignal.timeout(8000));}catch(error){state.shutdownError=error.message;}await Promise.race([new Promise(r=>child.once('exit',r)),new Promise(r=>setTimeout(r,5000))]);if(child.exitCode===null&&child.signalCode===null){child.kill();await new Promise(r=>setTimeout(r,1000));}state.processExit={exitCode:child.exitCode,signal:child.signalCode};state.endedAt=new Date().toISOString();save();rpc.close();}
