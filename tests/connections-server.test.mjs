import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {root} from '../src/config.mjs';
import {startConnections} from '../src/connections-server.mjs';
test('连接页API：保存、核对、启用、暂停、断开，拒绝伪造会话和外部来源',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'native-ui-test-'));let calls=0,wrongDirectory=false;
 const ui=await startConnections({runtime:dir,html:path.join(root,'web','connections.html'),catalogProvider:()=>({source:'test-fixture',observedAt:new Date(Date.now()-3*24*60*60*1000).toISOString(),threads:[{threadId:'c1',hostId:'local',title:'规划',readVerified:true}]}),dshProvider:async()=>{calls++;return [{sessionId:'d1',workspace:wrongDirectory?'D:\\other':'D:\\fixture',title:'执行',running:false}];}});
 t.after(async()=>{ui.server.closeAllConnections();await new Promise(r=>ui.server.close(r));assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep+'native-ui-test-'));fs.rmSync(dir,{recursive:true});});
 const origin=new URL(ui.url).origin;
 const post=async(route,data,source=origin)=>{const r=await fetch(ui.url+'api/'+route,{method:'POST',headers:{origin:source,'content-type':'application/json'},body:JSON.stringify(data)});return {status:r.status,body:await r.json()};};
 assert.equal((await fetch(origin+'/')).status,403);
 assert.equal((await post('save',{},'https://foreign.example')).status,403);
 const save={revision:0,name:'连接',mode:'autonomous',codexThreadId:'c1',codexHostId:'local',dshSessionId:'d1'};
 assert.equal((await post('save',{...save,dshSessionId:'fake'})).status,400);
 assert.equal((await post('save',save)).body.binding.state,'draft');
 assert.equal((await post('enable',{revision:1})).status,400);
 assert.equal((await post('verify',{revision:1})).body.binding.state,'verified');
 wrongDirectory=true;assert.equal((await post('enable',{revision:2})).status,400);assert.equal(ui.store.read().state,'verified');wrongDirectory=false;assert.equal((await post('enable',{revision:2})).body.binding.state,'enabled');
 assert.equal((await post('pause',{revision:3})).body.binding.state,'paused');
 assert.equal((await post('pause',{revision:3})).status,400);
 assert.equal((await post('disconnect',{revision:4})).body.binding.state,'disconnected');
 assert.ok(calls>=2); // Read-only provider, never a prompt/model call.
});
