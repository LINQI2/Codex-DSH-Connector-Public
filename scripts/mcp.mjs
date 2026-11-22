// Minimal MCP stdio adapter. It has no generic shell/file execution tool.
import readline from 'node:readline';
import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import {root} from '../src/config.mjs';
import {submitNativeQuestion} from '../src/routing.mjs';
const tool={name:'ask_codex',description:'向已绑定的Codex技术负责人提出具体技术问题。只登记真实当前Session提问，不是制作人权限审批。工具返回后结束本轮等待关联答复；不要循环查询或重复提交。',inputSchema:{type:'object',properties:{id:{type:'string',description:'稳定问题编号，以q-开头，只含字母数字下划线短横线'},question:{type:'string',description:'简明中文：事实、已尝试、需要负责人裁决的问题与建议'}},required:['id','question'],additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}};
const reply=(id,result)=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,result})+'\n');
const input=readline.createInterface({input:process.stdin});let chain=Promise.resolve();
input.on('line',line=>{chain=chain.then(async()=>{let msg;try{msg=JSON.parse(line);}catch{return;}if(msg.id===undefined)return;
 fs.mkdirSync(path.join(root,'.runtime'),{recursive:true});fs.appendFileSync(path.join(root,'.runtime','mcp-protocol.jsonl'),JSON.stringify({at:new Date().toISOString(),pid:process.pid,parentPid:process.ppid,method:msg.method})+'\n');
 try{if(msg.method==='initialize')return reply(msg.id,{protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'codex-dsh-technical-mailbox',version:'0.1.0'},instructions:'本工具只传递技术问题，不授予任何工程或工具权限。'});
 if(msg.method==='ping')return reply(msg.id,{});
 if(msg.method==='tools/list')return reply(msg.id,{tools:[tool]});
 if(msg.method==='tools/call'&&msg.params?.name==='ask_codex'){
  try{const value=await submitNativeQuestion(msg.params.arguments);return reply(msg.id,{content:[{type:'text',text:JSON.stringify(value)}]});}
  catch(error){return reply(msg.id,{isError:true,content:[{type:'text',text:error.message}]});}
 }
 process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:msg.id,error:{code:-32601,message:'Method not found'}})+'\n');
 }catch(error){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:msg.id,error:{code:-32603,message:error.message}})+'\n');}
 });});
