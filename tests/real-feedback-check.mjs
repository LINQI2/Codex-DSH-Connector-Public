// Explicitly invoked read-only host integration check; no model calls or task send.
import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import readline from 'node:readline';import {createHash} from 'node:crypto';
import {root} from '../src/config.mjs';
const bindingFile=path.join(root,'.runtime','binding.json'),bytes=fs.readFileSync(bindingFile),b=JSON.parse(bytes);
const child=spawn(process.execPath,[path.join(root,'scripts','planner-wait-mcp.mjs')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
const input=readline.createInterface({input:child.stdout});let next=1;const pending=new Map();
input.on('line',line=>{const value=JSON.parse(line),entry=pending.get(value.id);if(entry){pending.delete(value.id);entry(value);}});
const call=(method,params)=>new Promise(resolve=>{const id=next++;pending.set(id,resolve);child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
const timer=setTimeout(()=>{child.kill();console.error('只读MCP验收超时；未重发任务');process.exitCode=2;},45000);
try{
 const init=await call('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'connector-read-only-check',version:'1'}});
 const tools=await call('tools/list',{});
 const response=await call('tools/call',{name:'wait_dsh_feedback',arguments:{codexThreadId:b.codex.threadId,workspace:b.dsh.workspace,waitSeconds:35}});
 if(response.error||response.result?.isError)throw Error('MCP只读验收失败');
 const result=JSON.parse(response.result.content[0].text);
 const evidence={validation:'real-native-stream-via-stdio-mcp',server:init.result.serverInfo,tools:tools.result.tools.map(t=>t.name),...result,
  bindingUnchanged:createHash('sha256').update(bytes).digest('hex')===createHash('sha256').update(fs.readFileSync(bindingFile)).digest('hex')};
 const dir=path.join(root,'history','2026-11-05-feedback-wait');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'REAL_WAIT.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}finally{clearTimeout(timer);child.stdin.end();input.close();}
