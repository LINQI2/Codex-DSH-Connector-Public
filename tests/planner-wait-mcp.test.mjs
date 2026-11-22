import test from 'node:test';import assert from 'node:assert/strict';
import {plannerWaitHandler} from '../src/planner-wait-mcp.mjs';
test('MCP等待保持pending且ping/取消可响应；不逐步骤返回，不允许重复监听',async()=>{
 const replies=[];let started=false;
 const h=plannerWaitHandler({reply:x=>replies.push(x),wait:async({signal})=>{started=true;await new Promise(r=>signal.addEventListener('abort',r,{once:true}));return {kind:'cancelled'};}});
 const p=h.handle({id:1,method:'tools/call',params:{name:'wait_dsh_feedback',arguments:{codexThreadId:'c',workspace:'d'}}});
 assert.equal(started,true);assert.equal(replies.length,0);
 await h.handle({id:2,method:'ping'});assert.equal(replies[0].id,2);
 await h.handle({id:3,method:'tools/call',params:{name:'wait_dsh_feedback',arguments:{codexThreadId:'c',workspace:'d'}}});assert.equal(replies[1].result.isError,true);
 await h.handle({method:'notifications/cancelled',params:{requestId:1}});await p;assert.equal(JSON.parse(replies[2].result.content[0].text).kind,'cancelled');
});
test('MCP仅一个只读等待工具；拒绝任意命令/超时扩张/未知字段，隐藏私有错误',async()=>{
 const replies=[];const h=plannerWaitHandler({reply:x=>replies.push(x),wait:async()=>{throw Error('token=SECRET');}});
 await h.handle({id:1,method:'tools/list'});assert.equal(replies[0].result.tools.length,1);assert.equal(replies[0].result.tools[0].annotations.readOnlyHint,true);
 for(const a of [{waitSeconds:901},{shell:'danger'},{afterSeq:-1}])await h.handle({id:2,method:'tools/call',params:{name:'wait_dsh_feedback',arguments:{codexThreadId:'c',workspace:'d',...a}}});
 assert.ok(replies.slice(1).every(x=>x.error.code===-32602));
 await h.handle({id:3,method:'tools/call',params:{name:'wait_dsh_feedback',arguments:{codexThreadId:'c',workspace:'d'}}});assert.equal(replies.at(-1).result.isError,true);assert.doesNotMatch(JSON.stringify(replies),/SECRET/);h.close();
});
