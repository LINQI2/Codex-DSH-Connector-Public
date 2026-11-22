// Bounded acceptance via the same official Web RPC used by the native browser.
// No SDK, no credentials copying, no changes to the original read-only Host.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
import {root,loadConfig} from '../src/config.mjs';
const c=loadConfig(),fixture=path.join(root,'fixtures','file-task-20261031');
const out=path.join(root,'.runtime','web-file-task-evidence'),profile='connector-web-file-20261031';
fs.mkdirSync(out,{recursive:true});
const stateFile=path.join(out,'run.json');
const resume=process.argv.includes('--resume-created');
const prior=resume?JSON.parse(fs.readFileSync(stateFile,'utf8')):null;
if(prior&&(prior.promptAttempted||!prior.sessionId||!prior.processExit))throw Error('Cannot resume: prior send or process outcome needs reconciliation');
if(!resume&&fs.existsSync(stateFile))throw Error('Already attempted; inspect original records, never blindly resend');
if(!fs.existsSync(path.join(out,'before-metadata.json')))throw Error('Missing authorized permission preparation');
const dir=path.join(c.officialHost.home,'profiles',profile);
if(!resume&&fs.existsSync(dir))throw Error('Profile exists; do not overwrite');
if(!resume){
fs.mkdirSync(dir);
fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({private:true,dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app']}}}));
fs.writeFileSync(path.join(dir,'cordis.yml'),'[]\n');
fs.writeFileSync(path.join(dir,'cordis.patch.yml'),
 '- id: approval\n  config:\n    policy: never\n- id: permission\n  config:\n    defaultPreset: fixture-write\n    presets:\n      fixture-write:\n        sandbox: workspace-write\n        approval: never\n- id: sandbox-policy\n  config:\n    mode: workspace-write\n    workspaceRoot: '+JSON.stringify(fixture)+'\n- id: fs-sandbox\n  config:\n    cwd: '+JSON.stringify(fixture)+'\n- id: agent-default-model\n  name: "@deepseek-ai/dsh-agent-default-model"\n  config:\n    provider: deepseek-account\n    model: deepseek-flash\n    reasoningEffort: low\n'+
 ['tool-bash','tool-jobs','tool-web','tool-goal','tool-subagent','tool-subagent-fork','tool-subagent-control','tool-workflow','session-title-first-prompt-llm','session-title-all-prompts-llm'].map(id=>'- id: '+id+'\n  disabled: true\n').join(''));}
const hash=p=>createHash('sha256').update(fs.readFileSync(path.join(fixture,p))).digest('hex');
if(prior)fs.writeFileSync(path.join(out,'before-resume-created.json'),JSON.stringify(prior,null,2));
const state=prior?{...prior,phase:'resuming-created',error:null,processExit:null}:{startedAt:new Date().toISOString(),phase:'starting',profile,workspace:fixture,before:hash('summary.mjs'),protected:{test:hash('summary.test.mjs'),readme:hash('README.md')}};
const save=()=>fs.writeFileSync(stateFile,JSON.stringify(state,null,2));save();
const env={};for(const k of ['SystemRoot','WINDIR','ComSpec','PATH','PATHEXT','USERPROFILE','APPDATA','LOCALAPPDATA'])if(process.env[k])env[k]=process.env[k];
Object.assign(env,{DSH_HOME:c.officialHost.home,DSH_PERMISSION_MODE:'workspace-write',DSH_TELEMETRY_DISABLED:'1',TEMP:path.join(root,'.runtime','file-task-temp','dsh-task-20261031'),TMP:path.join(root,'.runtime','file-task-temp','dsh-task-20261031')});
const child=spawn(process.execPath,[c.officialHost.entry,'--profile',profile,'--host','127.0.0.1','--port','0','--no-open'],{cwd:fixture,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
let log='',browser,finished=false;const exited=new Promise(resolve=>{child.once('exit',(code,signal)=>{state.processExit={code,signal};resolve();});});
child.stdout.on('data',x=>log+=x);child.stderr.on('data',x=>log+=x);child.on('error',e=>{state.spawnError=e.message;save();});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
try{
 let authUrl;for(let i=0;i<180;i++){authUrl=log.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+/)?.[0];if(authUrl||child.exitCode!==null)break;await pause(250);}
 if(!authUrl)throw Error('Official Web Host failed to start');
 const origin=new URL(authUrl).origin;fs.writeFileSync(path.join(out,'ready.json'),JSON.stringify({authUrl,url:origin,pid:child.pid}));
 const auth=await fetch(authUrl,{redirect:'manual'});if(auth.status!==303)throw Error('Host authentication failed');
 const cookie=auth.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
 async function rpc(method,args){const r=await fetch(origin+'/api/'+method,{method:'POST',headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:randomUUID(),method,payload:{args}}),signal:AbortSignal.timeout(15000)});const b=await r.json();if(!b.result?.ok)throw Error(method+': '+JSON.stringify(b.result?.error??b.error));return b.result.value;}
 const ws=await rpc('workspace/create',{request:{path:fixture}});state.workspaceId=ws.workspace.workspaceId;save();
 // Fresh identity, durable before prompting; unknown create never silently repeated.
 if(!resume){state.requestedSessionId='connector-web-'+randomUUID();state.phase='creating';save();
 const created=await rpc('session/create',{request:{workspaceId:state.workspaceId,sessionId:state.requestedSessionId}});state.sessionId=created.sessionId;state.phase='created';save();}
 await rpc('session/rename',{request:{sessionId:state.sessionId,title:'网页接入文件执行验证'}});
 const list=await rpc('session/list',{_request:{}}),s=list.items.find(x=>x.sessionId===state.sessionId);
 if(!s||s.cwd!==fixture||s.running||s.projections.values.permissions.currentValue!=='fixture-write')throw Error('Session identity/permission mismatch');
 const {chromium}=createRequire(import.meta.url)(process.env.CONNECTOR_PLAYWRIGHT_MODULE);
 browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage({viewport:{width:1360,height:1000}});
 await page.goto(authUrl);await page.waitForTimeout(4000);
 const welcome=page.getByRole('button',{name:'继续',exact:true});if(await welcome.isVisible())await welcome.click();
 fs.writeFileSync(path.join(out,'before-navigation.txt'),await page.locator('body').innerText());await page.screenshot({path:path.join(out,'before-navigation.png')});
 // The native UI intentionally labels a no-turn Session as “新会话”, even
 // after an API rename. Verify exact workspace membership, not a guessed title.
 const registered=await rpc('workspace/create',{request:{path:fixture}});
 if(!registered.workspace.sessionIds.includes(state.sessionId))throw Error('Session missing from native workspace');
 state.registeredSessions=registered.workspace.sessionIds;
 await page.getByText('file-task-20261031',{exact:true}).first().waitFor();
 const title=page.getByText('网页接入文件执行验证',{exact:true}).first();
 if(await title.isVisible())await title.click();else await page.getByText('新会话',{exact:true}).last().click();
 state.browserVisibleBeforePrompt=true;save();await page.screenshot({path:path.join(out,'before-prompt.png')});
 state.requestId='web-file-task-20261031-once';state.phase='sending';state.promptAttempted=true;save();
 const text='这是Codex通过官方网页服务接口发送的限定文件验证。只在当前fixtures/file-task-20261031内操作，不访问外部工程，不联网、不安装依赖、不改权限。先读取summary.mjs和summary.test.mjs；仅把summary.mjs首行过时的“Deliberately incomplete baseline”注释改成准确的中文功能说明，保留函数行为和全部测试断言，不修改README.md或summary.test.mjs。使用官方PowerShell工具执行：& "'+process.execPath+'" --test --test-isolation=none summary.test.mjs。不要使用其他测试命令，不新建子Agent。若权限/沙箱错误则停止并真实报告，不重试。最后用简体中文说明实际修改、退出码和测试计数。';
 state.receipt=await rpc('session/prompt',{request:{sessionId:state.sessionId,requestId:state.requestId,mode:'queue',clientTimeZone:'Asia/Shanghai',content:[{type:'text',text}]}});state.phase='accepted';save();
 for(let i=0;i<90;i++){
  await pause(2000);const ls=await rpc('session/list',{_request:{}}),live=ls.items.find(x=>x.sessionId===state.sessionId);
  if(!live)throw Error('Session disappeared');
  const history=await rpc('session/page',{request:{address:{kind:'session',sessionId:state.sessionId},throughSeq:live.projections.asOfSeq,maxMessages:30}});
  fs.writeFileSync(path.join(out,'native-history.json'),JSON.stringify(history));
  const events=history.records.map(r=>r.event).filter(Boolean);const ended=events.some(e=>e.type==='turn/end');
  if(ended&&!live.running){finished=true;state.phase='ended';state.seq=live.projections.asOfSeq;state.public=events.filter(e=>['tool/result','assistant/message','turn/end'].includes(e.type)).map(e=>({seq:e.seq,type:e.type,text:e.data.message?.content?.filter(x=>x.type==='text').map(x=>x.text).join('\n'),reason:e.data.reason}));save();break;}
 }
 if(!finished)throw Error('Bounded observation ended: no completion proven; no resend');
 // Verify no reload was needed: the same open page must receive actual results.
 const finalText=state.public.filter(e=>e.type==='assistant/message'&&e.text).at(-1)?.text;
 if(!finalText)throw Error('No public final response');
 await page.getByText(finalText.split('\n')[0],{exact:false}).first().waitFor({timeout:20000});
 state.browserText=await page.locator('body').innerText();await page.screenshot({path:path.join(out,'after-completion.png'),fullPage:true});
 state.browserVisibleAfterPrompt=state.browserText.includes('网页接入文件执行验证')&&/3|三/.test(state.browserText);save();
 console.log(JSON.stringify({sessionId:state.sessionId,phase:state.phase,seq:state.seq,browserVisibleBeforePrompt:state.browserVisibleBeforePrompt,browserVisibleAfterPrompt:state.browserVisibleAfterPrompt}));
}catch(error){state.error=error.message;state.phase='needs-inspection';save();throw error;}
finally{
 await browser?.close();
 // Never kill a live/unknown task to make cleanup look successful.
 if(finished||!state.promptAttempted){child.kill();await Promise.race([exited,pause(10000)]);}
 state.after=hash('summary.mjs');state.protectedUnchanged=state.protected.test===hash('summary.test.mjs')&&state.protected.readme===hash('README.md');state.endedAt=new Date().toISOString();save();
 fs.writeFileSync(path.join(out,'host.log'),log.replace(/(token=)[^\s]+/g,'$1[REDACTED]'));
}
