import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';
import {Workspaces} from '../src/workspaces.mjs';import {root} from '../src/config.mjs';
test('登记现有项目只选择原生Host，不授予写权限或代建实验环境',async()=>{
 const w=new Workspaces({expectedWorkspace:'D:\\discussion',hostReadyFile:'D:\\native-ready.json',connectedProjects:[{key:'my-game',title:'新游戏',path:'D:\\new-game'}]});
 assert.equal(w.catalog().find(x=>x.key==='my-game').state,'connected');assert.match(w.catalog().find(x=>x.key==='my-game').permission,/不授予/);
 assert.equal(w.configFor({workspace:'D:\\new-game',sessionId:'native-existing'}).expectedWorkspace,'D:\\new-game');assert.equal(w.configFor({workspace:'D:\\new-game',sessionId:'native-existing'}).hostReadyFile,'D:\\native-ready.json');
 await assert.rejects(w.create({key:'my-game',id:'registration-test-00001'}),/已有会话/);assert.throws(()=>w.configFor({workspace:'D:\\unregistered',sessionId:'x'}),/未准备/);
 assert.throws(()=>new Workspaces({connectedProjects:[{key:'discussion',title:'覆盖',path:'D:\\bad'}]}).catalog(),/重复/);
});
test('工作目录只有两个白名单，不能把任意工程借原Host执行',async t=>{
 const runtime=fs.mkdtempSync(path.join(os.tmpdir(),'connector-workspace-'));t.after(()=>fs.rmSync(runtime,{recursive:true}));const w=new Workspaces({expectedWorkspace:'D:\\discussion',hostReadyFile:'D:\\ready.json'},{runtime});assert.equal(w.catalog().length,2);assert.equal(w.catalog()[1].path,path.join(root,'fixtures','file-task-20261031'));
 await assert.rejects(w.prepare('formal-project'),/未授权/);assert.throws(()=>w.configFor({workspace:'D:\\private',sessionId:'x'}),/未准备/);assert.throws(()=>w.configFor({workspace:w.catalog()[1].path,sessionId:'x'}),/未准备/);
 w.write({state:'ready',readyFile:'D:\\managed-ready.json',workspace:w.catalog()[1].path});assert.equal(w.configFor({workspace:w.catalog()[1].path,sessionId:'x'}).hostReadyFile,'D:\\managed-ready.json');await assert.rejects(w.prepare('file-fixture'),/未确认回收/);
});
test('原生Web创建会话带workspaceId；重复/unknown均不另建替代',async t=>{
 const runtime=fs.mkdtempSync(path.join(os.tmpdir(),'connector-workspace-'));let createCalls=0,fail=false;
 const server=http.createServer(async(req,res)=>{if(req.url.startsWith('/?token=')){res.writeHead(303,{'set-cookie':'test=local; Path=/','location':'/'});return res.end();}let raw='';for await(const b of req)raw+=b;const args=JSON.parse(raw).payload.args;let value={};if(req.url==='/api/workspace/create')value={workspace:{workspaceId:'ws-test'}};if(req.url==='/api/session/create'){createCalls++;assert.equal(args.request.workspaceId,'ws-test');if(fail){res.setHeader('content-type','application/json');return res.end(JSON.stringify({result:{ok:false,error:'simulated failure'}}));}value={sessionId:args.request.sessionId};}res.setHeader('content-type','application/json');res.end(JSON.stringify({result:{ok:true,value}}));});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(runtime,{recursive:true});});
 const url='http://127.0.0.1:'+server.address().port,ready=path.join(runtime,'ready.json');fs.writeFileSync(ready,JSON.stringify({url,authUrl:url+'/?token=test'}));const w=new Workspaces({expectedWorkspace:'D:\\discussion',hostReadyFile:ready},{runtime});
 const q={key:'discussion',id:'native-create-test-00001'};assert.equal((await w.create(q)).state,'created');await assert.rejects(w.create(q),/已有创建/);fail=true;await assert.rejects(w.create({...q,id:'native-create-test-00002'}),/待核对/);await assert.rejects(w.create({...q,id:'native-create-test-00003'}),/待核对/);assert.equal(createCalls,2);
});
