import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
const norm=p=>path.resolve(p.startsWith('\\\\?\\')?p.slice(4):p).toLowerCase();
const under=(root,file)=>{const r=path.relative(norm(root),norm(file));return !!r&&r!=='..'&&!r.startsWith('..'+path.sep)&&!path.isAbsolute(r);};
export function codexUsage(v){
 if(!v||!['input_tokens','output_tokens','total_tokens'].every(k=>Number.isSafeInteger(v[k])&&v[k]>=0))return null;
 const read=v.cached_input_tokens,write=v.cache_write_input_tokens??0;
 if(!Number.isSafeInteger(read)||read<0||!Number.isSafeInteger(write)||write<0||read+write>v.input_tokens||v.total_tokens!==v.input_tokens+v.output_tokens)return null;
 // Codex cached input is a SUBSET of input; reasoning is a SUBSET of output.
 return {uncachedInputTokens:v.input_tokens-read-write,cacheReadTokens:read,cacheWriteTokens:write,outputTokens:v.output_tokens};
}
const time=(v,fallback)=>Number.isFinite(v)?(v<1e12?v*1000:v):Number.isFinite(Date.parse(fallback))?Date.parse(fallback):null;
// Incremental JSONL adapter: read selected native logs, retain ONLY numeric metrics.
export class CodexLogMetrics{
 constructor(file,{threadId,cwd}){Object.assign(this,{file,threadId,cwd});this.reset();}
 reset(){this.offset=0;this.pending=Buffer.alloc(0);this.identity=false;this.usage=null;this.turns=new Map();this.generation=null;this.lastAt=null;}
 inspect(){
  const stat=fs.statSync(this.file),tag=String(stat.ino)+':'+String(stat.birthtimeMs);let reset=false;
  if(this.generation&&(this.generation!==tag||stat.size<this.offset)){this.reset();reset=true;}
  if(stat.size>256*1024*1024)throw Error('Codex记录过大，停止本次统计读取，不影响原会话');
  this.generation=tag;const fd=fs.openSync(this.file,'r');let malformed=false;
  try{while(this.offset<stat.size){const b=Buffer.alloc(Math.min(1024*1024,stat.size-this.offset)),n=fs.readSync(fd,b,0,b.length,this.offset);if(!n)break;this.offset+=n;this.pending=Buffer.concat([this.pending,b.subarray(0,n)]);let i;
   while((i=this.pending.indexOf(10))!==-1){const line=this.pending.subarray(0,i).toString('utf8').trim();this.pending=this.pending.subarray(i+1);if(!line)continue;let r;try{r=JSON.parse(line);}catch{malformed=true;continue;}
    const p=r.payload;if(r.type==='session_meta'){if(p?.id!==this.threadId||norm(p.cwd??'')!==norm(this.cwd))throw Error('Codex原生会话身份不匹配');this.identity=true;}
    if(r.type!=='event_msg'||!p)continue;
    if(p.type==='token_count'&&p.info?.total_token_usage){this.usage=codexUsage(p.info.total_token_usage);this.lastAt=r.timestamp;}
    if(p.type==='task_started'&&typeof p.turn_id==='string'){const old=this.turns.get(p.turn_id);this.turns.set(p.turn_id,{id:p.turn_id,start:Number.isFinite(Date.parse(r.timestamp))?Date.parse(r.timestamp):time(p.started_at,null),end:old?.end??null});}
    if(['task_complete','turn_aborted'].includes(p.type)&&typeof p.turn_id==='string'){const old=this.turns.get(p.turn_id),end=Number.isFinite(Date.parse(r.timestamp))?Date.parse(r.timestamp):time(p.completed_at,null),duration=Number.isFinite(p.duration_ms)&&p.duration_ms>=0?p.duration_ms:null;this.turns.set(p.turn_id,{id:p.turn_id,start:duration!==null&&end!==null?end-duration:old?.start??time(p.started_at,null),end});}
   }if(this.pending.length>16*1024*1024)throw Error('Codex记录行过大，停止本次读取');
  }}finally{fs.closeSync(fd);}
  if(!this.identity)throw Error('未取得匹配的Codex原生身份');
  return {threadId:this.threadId,hostId:'local',cwd:this.cwd,usage:this.usage,turns:[...this.turns.values()],running:[...this.turns.values()].some(t=>t.end===null),cursor:this.offset-this.pending.length,generation:this.generation,observedAt:new Date().toISOString(),lastUsageAt:this.lastAt,issue:reset?'原生记录发生替换或截断':malformed?'原生记录含不可解析行，时间覆盖待核对':null,source:'Codex本机原生JSONL用量与回合事件（只读；非账单）'};
 }
}
export function codexSourceFor({home,catalogProvider}){
 const readers=new Map();return async target=>{
  if(!target||target.hostId!=='local'||typeof target.threadId!=='string'||!target.threadId||typeof target.cwd!=='string'||!path.isAbsolute(target.cwd))throw Error('请选择已核对的本机Codex会话与目录');
  const row=catalogProvider().threads.find(t=>t.threadId===target.threadId&&t.hostId==='local'&&t.readVerified&&norm(t.cwd)===norm(target.cwd));if(!row)throw Error('Codex会话不在当前可读取列表中，请刷新并核对');
  let db;try{
   db=new DatabaseSync(path.join(home,'state_5.sqlite'),{readOnly:true});const r=db.prepare('SELECT rollout_path,cwd FROM threads WHERE id=? AND archived=0').get(target.threadId);
   if(!r||norm(r.cwd)!==norm(row.cwd))throw Error('Codex索引身份不符');
   const file=fs.realpathSync(r.rollout_path),sessionRoot=fs.realpathSync(path.join(home,'sessions'));if(!under(sessionRoot,file))throw Error('Codex指标来源不在原生sessions中，不读取其他文件');
   const key=target.threadId+':'+file;if(!readers.has(key))readers.set(key,new CodexLogMetrics(file,{threadId:target.threadId,cwd:row.cwd}));return readers.get(key).inspect();
  }finally{db?.close();}
 };
}
