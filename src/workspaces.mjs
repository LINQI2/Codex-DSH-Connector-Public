// The only writable workspace is the exact fixture authorized by its owner.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {sidebarSessions} from './sidebar-sessions.mjs';
import {nativePermission} from './permission-view.mjs';
import {root} from './config.mjs';
import {webApi} from './web-api.mjs';
import {oncePerSource} from './catalog-read.mjs';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
export class Workspaces{
 constructor(config,{runtime=path.join(root,'.runtime')}={}){this.config=config;this.runtime=runtime;this.file=path.join(this.runtime,'managed-workspace.json');this.child=null;this.busy=false;this.expectedExit=false;}
 read(){return fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')):null;}
 write(s){s.updatedAt=new Date().toISOString();fs.writeFileSync(this.file,JSON.stringify(s,null,2));return s;}
 projects(){const file=path.join(this.runtime,'registered-projects.json'),extra=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[];const rows=[...(this.config.connectedProjects??[]),...extra];if(!Array.isArray(extra))throw Error('目录登记记录格式不符');const keys=new Set(['discussion','file-fixture']);for(const p of rows){if(!p||typeof p.key!=='string'||!/^[a-zA-Z0-9-]+$/.test(p.key)||keys.has(p.key)||typeof p.path!=='string'||!path.isAbsolute(p.path)||typeof p.title!=='string')throw Error('项目目录配置无效或重复');keys.add(p.key);}return rows;}
 registerProject(input){
  if(typeof input.path!=='string'||!path.isAbsolute(input.path)||input.path.length>2000)throw Error('请填写工作目录的完整绝对路径');
  let directory;try{directory=fs.realpathSync(input.path);if(!fs.statSync(directory).isDirectory())throw Error();}catch{throw Error('目录不存在或当前用户不可读取，请核对路径');}
  const norm=p=>path.resolve(p.replace(/^\\\\\?\\/,'' )).toLowerCase();
  const existing=this.projects().find(p=>norm(p.path)===norm(directory));if(existing)return {project:existing,message:'该目录已登记，刷新后选择会话即可'};
  if(norm(directory)===norm(this.config.expectedWorkspace))return {message:'该目录已经是原生讨论目录，刷新后选择会话即可'};
  const title=typeof input.title==='string'&&input.title.trim()?input.title.trim():path.basename(directory);if(title.length>100)throw Error('目录名称不能超过100字');
  const file=path.join(this.runtime,'registered-projects.json'),rows=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[];
  const project={key:'manual-'+randomUUID(),title,path:directory};rows.push(project);fs.mkdirSync(this.runtime,{recursive:true});
  if(fs.existsSync(file))fs.copyFileSync(file,file+'.backup-'+Date.now());const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(rows,null,2));fs.renameSync(tmp,file);
  return {project,message:'目录已登记；未修改项目或权限，请刷新并选择原生会话'};
 }
 catalog(){const s=this.read();return [{key:'discussion',title:'原只读讨论工作区',path:this.config.expectedWorkspace,permission:'只读；不开放Shell',state:'original'},{key:'file-fixture',title:'已授权文件开发测试目录',path:path.join(root,'fixtures','file-task-20261031'),permission:'仅此目录可写；官方受限Shell；never；不接RRPG/Pilot',state:s?.state??'closed',detail:s?.error??null},...this.projects().map(p=>({...p,permission:'沿用已有原生会话权限；登记目录不授予文件或Shell权限',state:'connected'}))];}
 async metadata(s,operation){
  const exe=this.config.metadataPowerShell;if(!exe||!fs.existsSync(exe))throw Error('缺少已核对的PowerShell7路径，不修改执行策略');
  await new Promise((resolve,reject)=>{const p=spawn(exe,['-NoProfile','-File',path.join(root,'scripts','file-task-acl.ps1'),'-Operation',operation,'-EvidenceSet',s.evidence],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});let log='';p.stdout.on('data',x=>log+=x);p.stderr.on('data',x=>log+=x);p.once('error',reject);p.once('exit',code=>{fs.appendFileSync(path.join(this.runtime,s.evidence,'metadata.log'),operation+'\n'+log+'\n');code===0?resolve():reject(Error('限定权限'+operation+'失败，保留现场，不扩大权限'));});});
 }
 async prepare(key){
  if(key==='discussion'||this.projects().some(p=>p.key===key))return {state:'ready',url:JSON.parse(fs.readFileSync(this.config.hostReadyFile,'utf8')).authUrl};
  if(key!=='file-fixture')throw Error('未授权的工作目录');
  if(this.busy)throw Error('工作区正在准备或回收');this.busy=true;
  try{
   let s=this.read();if(s?.state==='ready'&&this.child){await webApi(s.readyFile);return {state:'ready',url:JSON.parse(fs.readFileSync(s.readyFile,'utf8')).authUrl};}
   if(s&&!['closed'].includes(s.state))throw Error('上次工作区未确认回收，请由维护端核对；不自动重开');
   const id=randomUUID().replaceAll('-',''),fixture=path.join(root,'fixtures','file-task-20261031');
   if(fs.realpathSync(fixture)!==fixture)throw Error('目录身份或链接不匹配');
   s={state:'preparing',id,evidence:'web-managed-'+id,profile:'connector-managed-'+id,workspace:fixture,createdAt:new Date().toISOString()};
   fs.mkdirSync(path.join(this.runtime,s.evidence));s.readyFile=path.join(this.runtime,s.evidence,'ready.json');this.write(s);
   await this.metadata(s,'snapshot');await this.metadata(s,'prepare-metadata');
   const dir=path.join(this.config.officialHost.home,'profiles',s.profile);fs.mkdirSync(dir);
   fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({private:true,dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app']}}}));fs.writeFileSync(path.join(dir,'cordis.yml'),'[]\n');
   fs.writeFileSync(path.join(dir,'cordis.patch.yml'),'- id: system-prompt\n  config:\n    personaSuffix: '+JSON.stringify(fs.readFileSync(path.join(root,'rules','development.md'),'utf8'))+'\n- id: approval\n  config:\n    policy: never\n- id: permission\n  config:\n    defaultPreset: fixture-write\n    presets:\n      fixture-write:\n        sandbox: workspace-write\n        approval: never\n- id: sandbox-policy\n  config:\n    mode: workspace-write\n    workspaceRoot: '+JSON.stringify(fixture)+'\n- id: fs-sandbox\n  config:\n    cwd: '+JSON.stringify(fixture)+'\n- id: agent-default-model\n  name: "@deepseek-ai/dsh-agent-default-model"\n  config:\n    provider: deepseek-account\n    model: deepseek-flash\n    reasoningEffort: low\n'+['tool-bash','tool-jobs','tool-web','tool-goal','tool-subagent','tool-subagent-fork','tool-subagent-control','tool-workflow','session-title-llm'].map(x=>'- id: '+x+'\n  disabled: true\n').join('')+'- insert:\n    - id: codex-bridge-mcp\n      name: "@deepseek-ai/dsh-mcp-client"\n      config:\n        transport: stdio\n        serverName: codex_bridge\n        command: '+JSON.stringify(process.execPath)+'\n        args: ['+JSON.stringify(path.join(root,'scripts','mcp.mjs'))+']\n        cwd: '+JSON.stringify(root)+'\n        failOnStartupError: true\n        reconnect:\n          enabled: false\n');
   const env={};for(const k of ['SystemRoot','WINDIR','ComSpec','PATH','PATHEXT','USERPROFILE','APPDATA','LOCALAPPDATA'])if(process.env[k])env[k]=process.env[k];Object.assign(env,{DSH_HOME:this.config.officialHost.home,DSH_PERMISSION_MODE:'workspace-write',DSH_TELEMETRY_DISABLED:'1',TEMP:path.join(root,'.runtime','file-task-temp','dsh-task-20261031'),TMP:path.join(root,'.runtime','file-task-temp','dsh-task-20261031')});
   this.expectedExit=false;const child=this.child=spawn(process.execPath,[this.config.officialHost.entry,'--profile',s.profile,'--host','127.0.0.1','--port','0','--no-open'],{cwd:fixture,env,windowsHide:true,stdio:['ignore','pipe','pipe']});let log='';let spawnError;
   child.stdout.on('data',x=>log+=x);child.stderr.on('data',x=>log+=x);child.on('error',e=>{spawnError=e;});child.on('exit',(code,signal)=>{this.child=null;if(!this.expectedExit)this.write({...this.read(),state:'recovery-required',error:'执行服务意外退出，权限尚未确认回收；请联系维护端',exit:{code,signal}});});
   let url;for(let i=0;i<180;i++){url=log.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+/)?.[0];if(url||spawnError||child.exitCode!==null)break;await pause(250);}
   fs.writeFileSync(path.join(this.runtime,s.evidence,'host.log'),log.replace(/(token=)[^\s]+/g,'$1[REDACTED]'));
   if(!url)throw Error('官方文件工作区未就绪；不重复启动，需维护核对');
   fs.writeFileSync(s.readyFile,JSON.stringify({url:new URL(url).origin,authUrl:url,pid:child.pid}));await webApi(s.readyFile);
   s.state='ready';s.pid=child.pid;this.write(s);return {state:'ready',url};
  }catch(error){const s=this.read();if(s)this.write({...s,state:'recovery-required',error:error.message});throw error;}finally{this.busy=false;}
 }
 configFor(dsh){
  if(dsh.workspace===this.config.expectedWorkspace||this.projects().some(p=>path.resolve(p.path)===path.resolve(dsh.workspace)))return {...this.config,expectedSessionId:dsh.sessionId,expectedWorkspace:dsh.workspace};
  const s=this.read();if(dsh.workspace!==path.join(root,'fixtures','file-task-20261031')||s?.state!=='ready')throw Error('该文件工作区未准备或需恢复；不能借原只读Host执行');
  return {...this.config,hostReadyFile:s.readyFile,expectedSessionId:dsh.sessionId,expectedWorkspace:s.workspace};
 }
 async candidates(){
  const read=oncePerSource(async ready=>{const rpc=await webApi(ready);const [list,baseline]=await Promise.all([rpc('session/list',{_request:{}}),rpc.workspaceSnapshot(createRequire(this.config.officialHost.entry)('ws'))]);return {list,baseline};});
  const rows=[];for(const entry of this.catalog()){
   if(entry.key==='file-fixture'&&(entry.state!=='ready'||!this.child))continue;
   const ready=entry.key==='file-fixture'?this.read().readyFile:this.config.hostReadyFile;
   const {list,baseline}=await read(ready);
   for(const s of sidebarSessions(list.items,baseline,entry.path))rows.push({sessionId:s.sessionId,title:s.projections.values.title??'未命名会话',workspace:s.cwd,running:s.running,workspaceKey:entry.key,permissionView:nativePermission(s.projections.values.permissions?.currentValue),permission:s.projections.values.permissions?.currentValue==='probe-read-only'?'原生只读；未授予工程修改或Shell权限':entry.permission});
  }return rows;
 }
 async create({key,id}){
  if(!/^[a-zA-Z0-9-]{16,80}$/.test(id))throw Error('缺少稳定的创建编号');
  const entry=this.catalog().find(x=>x.key===key);if(!entry)throw Error('没有此授权目录');
  if(entry.state==='connected')throw Error('此目录直接连接已有会话；如需新会话，请先在DSH原生客户端创建');
  const ready=key==='discussion'?this.config.hostReadyFile:(()=>{const s=this.read();if(s?.state!=='ready'||!this.child)throw Error('请先准备文件工作区');return s.readyFile;})();
  const dir=path.join(this.runtime,'session-creates');fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,id+'.json');if(fs.existsSync(file))throw Error('已有创建记录，先核对，不重复创建');
  for(const name of fs.readdirSync(dir)){const old=JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));if(old.key===key&&['attempted','unknown'].includes(old.state))throw Error('此工作区有待核对创建记录，不另建替代会话');}
  const rpc=await webApi(ready),ws=await rpc('workspace/create',{request:{path:entry.path}});const row={id,key,workspaceId:ws.workspace.workspaceId,state:'attempted',requestedSessionId:'connector-web-'+id,at:new Date().toISOString()};fs.writeFileSync(file,JSON.stringify(row),{flag:'wx'});
  try{const result=await rpc('session/create',{request:{workspaceId:row.workspaceId,sessionId:row.requestedSessionId}});row.sessionId=result.sessionId;row.state='created';fs.writeFileSync(file,JSON.stringify(row));try{const title=(key==='discussion'?'讨论会话':'开发会话')+' · '+new Date().toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'});await rpc('session/rename',{request:{sessionId:row.sessionId,title}});row.title=title;}catch(error){row.warning='会话已创建，名称设置未成功：'+error.message;}fs.writeFileSync(file,JSON.stringify(row));return {...row,message:'已创建空白原生会话；未发送模型指令，请在DSH列表中选择它并保存连接。'};}
  catch(error){row.state='unknown';row.error=error.message;fs.writeFileSync(file,JSON.stringify(row));throw Error('创建结果待核对，不再点击创建：'+error.message);}
 }
 async close(){
  if(this.busy)throw Error('工作区正在处理');let s=this.read();if(!s||s.state==='closed')return {state:'closed'};
  if(s.state!=='ready'||!this.child)throw Error('工作区需要维护恢复，不按旧PID强杀或盲目回收');
  const rpc=await webApi(s.readyFile),list=await rpc('session/list',{_request:{}});if(list.items.some(x=>x.running))throw Error('DSH正在执行或等待答复；先在官方客户端停止并核对，不关闭或回收');
  this.busy=true;try{
   this.write({...s,state:'closing'});this.expectedExit=true;const child=this.child;const ended=new Promise(resolve=>child.once('exit',resolve));child.kill();await Promise.race([ended,pause(10000)]);if(this.child)throw Error('尚未确认执行服务退出，不回收权限');
   await this.metadata(s,'cleanup');const dir=path.join(this.config.officialHost.home,'profiles',s.profile),archive=path.join(this.runtime,s.evidence,'profile-completed');fs.renameSync(dir,archive);
   s=this.write({...s,state:'closed',closedAt:new Date().toISOString()});return {state:s.state,message:'执行服务已关闭，限定权限核验恢复，原生会话和文件保留。'};
  }catch(error){this.write({...this.read(),state:'recovery-required',error:error.message});throw error;}finally{this.busy=false;}
 }
}
