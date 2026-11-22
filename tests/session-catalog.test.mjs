import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {codexIndex} from '../src/session-catalog.mjs';
import {startConnections} from '../src/connections-server.mjs';
import {root} from '../src/config.mjs';
const dirFor=t=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'connector-catalog-'));t.after(()=>fs.rmSync(d,{recursive:true}));return d;};
test('只读索引发现新会话、过滤其他目录与归档，不读取正文或改原数据库',t=>{
 const dir=dirFor(t),file=path.join(dir,'state.sqlite'),d=new DatabaseSync(file);
 d.exec('CREATE TABLE threads(id TEXT,title TEXT,cwd TEXT,archived INTEGER,updated_at INTEGER)');
 const insert=d.prepare('INSERT INTO threads VALUES(?,?,?,?,?)');insert.run('c1','新会话',dir,0,2);insert.run('c2','归档',dir,1,3);insert.run('c3','其他',path.dirname(dir),0,4);d.close();
 const before=fs.readFileSync(file),list=codexIndex(file,[dir]);assert.deepEqual(list.threads.map(x=>x.threadId),['c1']);assert.equal(list.threads[0].permissionView.label,'未读取');assert.deepEqual(fs.readFileSync(file),before);
 assert.throws(()=>codexIndex(path.join(dir,'missing'),[dir]),/不可读取/);assert.equal(fs.existsSync(path.join(dir,'missing')),false);
 if(process.platform==='win32')assert.equal(codexIndex(file,[dir.toUpperCase().replaceAll('\\','/')]).threads[0].threadId,'c1');
 if(process.platform==='win32'){
  const writer=new DatabaseSync(file);writer.prepare('INSERT INTO threads VALUES(?,?,?,?,?)').run('c4','Windows扩展路径','\\\\?\\'+dir,0,5);writer.close();
  const list=codexIndex(file,[dir]);assert.equal(list.threads[0].threadId,'c4');assert.equal(list.threads[0].cwd,dir);
 }
 const writer=new DatabaseSync(file);writer.exec('ALTER TABLE threads ADD COLUMN source TEXT; ALTER TABLE threads ADD COLUMN thread_source TEXT');
 writer.prepare('INSERT INTO threads VALUES(?,?,?,?,?,?,?)').run('internal','内部审查',dir,0,9,'{"subagent":{}}','guardian_review');writer.close();
 assert.equal(codexIndex(file,[dir]).threads.some(x=>x.threadId==='internal'),false);
});
test('优先客户端名称，改名刷新可见；空名称回退旧标题，不修改原生索引',t=>{
 const dir=dirFor(t),file=path.join(dir,'names.sqlite'),db=new DatabaseSync(file);
 db.exec('CREATE TABLE threads(id TEXT,title TEXT,name TEXT,cwd TEXT,archived INTEGER,updated_at INTEGER)');
 const insert=db.prepare('INSERT INTO threads VALUES(?,?,?,?,?,?)');
 insert.run('renamed','## Referenced chats with Codex: wrapper','接手 Fisch 单机 H5 项目',dir,0,3);
 insert.run('blank','旧标题','  ',dir,0,2);insert.run('null','备用标题',null,dir,0,1);
 db.close();const before=fs.readFileSync(file);
 assert.deepEqual(codexIndex(file,[dir]).threads.map(r=>[r.threadId,r.title]),[['renamed','接手 Fisch 单机 H5 项目'],['blank','旧标题'],['null','备用标题']]);
 assert.deepEqual(fs.readFileSync(file),before);
 const writer=new DatabaseSync(file);writer.prepare('UPDATE threads SET name=? WHERE id=?').run('客户端新名称','renamed');writer.close();
 assert.equal(codexIndex(file,[dir]).threads[0].title,'客户端新名称');
});
test('会话移出和恢复仅改变连接器，可持久化；绑定保护及伪造/跨源拒绝',async t=>{
 const dir=dirFor(t),codex=[{threadId:'c1',hostId:'local',title:'规划',readVerified:true}],dsh=[{sessionId:'d1',workspace:dir,title:'执行',running:false}];const before=JSON.stringify({codex,dsh});
 const ui=await startConnections({runtime:dir,html:path.join(root,'web/connections.html'),catalogProvider:()=>({threads:codex}),dshProvider:async()=>dsh});
 t.after(async()=>{ui.server.closeAllConnections();await new Promise(r=>ui.server.close(r));});
 const origin=new URL(ui.url).origin,post=async(route,data,source=origin)=>{const r=await fetch(ui.url+'api/'+route,{method:'POST',headers:{origin:source,'content-type':'application/json'},body:JSON.stringify(data)});return {status:r.status,body:await r.json()};};
 const update={kind:'codex',key:'codex:local:c1',hidden:true};
 assert.equal((await post('session-visibility',update,'https://evil.example')).status,403);
 assert.equal((await post('session-visibility',{...update,key:'codex:local:fake'})).status,400);
 assert.equal((await post('session-visibility',update)).status,200);
 let c=await(await fetch(ui.url+'api/candidates')).json();assert.equal(c.codex.length,0);assert.equal(c.available.codex.length,1);
 assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'session-visibility.json'))).hidden.length,1);
 const save={revision:0,name:'连接',mode:'autonomous',codexThreadId:'c1',codexHostId:'local',dshSessionId:'d1'};
 assert.equal((await post('save',save)).status,400);
 assert.equal((await post('session-visibility',{...update,hidden:false})).status,200);
 assert.equal((await post('save',save)).status,200);
 assert.equal((await post('session-visibility',update)).status,400);assert.equal(ui.store.read().revision,1);
 assert.equal((await post('disconnect',{revision:1})).status,200);
 assert.equal((await post('session-visibility',{kind:'dsh',key:'dsh:d1',hidden:true})).status,200);
 c=await(await fetch(ui.url+'api/candidates')).json();assert.equal(c.dsh.length,0);
 assert.equal((await post('session-visibility',{kind:'dsh',key:'dsh:d1',hidden:false})).status,200);
 assert.equal(JSON.stringify({codex,dsh}),before); // No native mutation callback exists.
});
