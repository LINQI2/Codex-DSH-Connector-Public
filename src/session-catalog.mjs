import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
const displayPath=p=>p.startsWith('\\\\?\\')?p.slice(4):p;
const normalized=p=>path.resolve(displayPath(p)).toLowerCase();
// Local Codex index adapter, not an official live desktop API. No writes or chat bodies.
export function codexIndex(file,directories){
 const allowed=new Set(directories.filter(Boolean).map(normalized));let db;
 try{
  db=new DatabaseSync(file,{readOnly:true});
  const columns=new Set(db.prepare('PRAGMA table_info(threads)').all().map(c=>c.name));
  if(!['id','title','cwd','archived','updated_at'].every(c=>columns.has(c)))throw Error('索引字段不兼容');
  const usersOnly=(columns.has('thread_source')?" AND (thread_source IS NULL OR thread_source='user')":'')+(columns.has('source')?" AND (source IS NULL OR source NOT LIKE '%subagent%')":'');
  // Desktop renames/generated chat names live in name; title may still be the first prompt.
  const displayTitle=columns.has('name')?"COALESCE(NULLIF(trim(name),''),NULLIF(trim(title),''),'未命名会话')":"COALESCE(NULLIF(trim(title),''),'未命名会话')";
  const stmt=db.prepare("SELECT id,"+displayTitle+" AS title,cwd,updated_at FROM threads WHERE archived=0"+usersOnly+" AND lower(replace(replace(cwd, char(92), '/'), '//?/', ''))=? ORDER BY updated_at DESC");
  const rows=directories.filter(Boolean).flatMap(dir=>stmt.all(normalized(dir).replaceAll('\\','/')));
  const seen=new Set();return {source:'Codex本机会话索引（只读；非桌面实时API）',observedAt:new Date().toISOString(),threads:rows.filter(r=>allowed.has(normalized(r.cwd))&&!seen.has(r.id)&&seen.add(r.id)).map(r=>({threadId:r.id,hostId:'local',title:r.title||'未命名会话',cwd:displayPath(r.cwd),readVerified:true,permissionView:{label:'未读取',detail:'本次仅查询会话名称和目录，没有读取权限或聊天正文。'}}))};
 }catch{throw Error('Codex本机会话索引不可读取或版本不兼容；保留原会话，不使用旧清单冒充刷新成功。');}finally{db?.close();}
}
export class SessionVisibility{
 constructor(runtime){this.file=path.join(runtime,'session-visibility.json');}
 read(){return fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')):{hidden:[]};}
 key(kind,row){if(kind==='codex')return 'codex:'+row.hostId+':'+row.threadId;if(kind==='dsh')return 'dsh:'+row.sessionId;throw Error('未知会话类型');}
 visible(kind,rows){const hidden=new Set(this.read().hidden);return rows.filter(r=>!hidden.has(this.key(kind,r)));}
 update(kind,row,hidden){const state=this.read(),key=this.key(kind,row),keys=new Set(state.hidden);hidden?keys.add(key):keys.delete(key);const next={hidden:[...keys],updatedAt:new Date().toISOString()};const tmp=this.file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(next,null,2));fs.renameSync(tmp,this.file);return next;}
}
