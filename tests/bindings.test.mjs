import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {BindingStore} from '../src/bindings.mjs';
function setup(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'native-bind-test-'));t.after(()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep+'native-bind-test-'));fs.rmSync(dir,{recursive:true});});return new BindingStore(dir);}
const input={name:'测试连接',mode:'autonomous',codex:{threadId:'c1',hostId:'local',title:'规划'},dsh:{sessionId:'d1',workspace:'D:\\fixture',title:'执行'}};
test('历史核对超过十分钟不会只因时间而阻止启用',t=>{const s=setup(t);s.save(input,0);const b=s.verify({codexIdentity:true,dshIdentity:true},1);b.verification.checkedAt='2020-01-01T00:00:00.000Z';fs.writeFileSync(s.file,JSON.stringify(b));assert.equal(s.transition('enable',2).state,'enabled');});
test('保存后不能直接发送或启用',t=>{const s=setup(t);s.save(input,0);assert.throws(()=>s.assertCanSend('d1'),/未启用/);assert.throws(()=>s.transition('enable',1),/先检查/);});
test('核对后启用，暂停/断开均阻止发送，历史保留',t=>{const s=setup(t);s.save(input,0);s.verify({codexIdentity:true,dshIdentity:true},1);s.transition('enable',2);s.assertCanSend('d1');s.transition('pause',3);assert.throws(()=>s.assertCanSend('d1'),/暂停/);s.transition('enable',4);s.transition('disconnect',5);assert.throws(()=>s.assertCanSend('d1'),/未启用/);assert.equal(s.read().dsh.sessionId,'d1');assert.equal(fs.readFileSync(path.join(s.dir,'binding-audit.jsonl'),'utf8').trim().split('\n').length,6);});
test('更换会话使旧核对失效',t=>{const s=setup(t);s.save(input,0);s.verify({codexIdentity:true,dshIdentity:true},1);const b=s.save({...input,dsh:{...input.dsh,sessionId:'d2'}},2);assert.equal(b.verification,null);assert.equal(b.state,'draft');});
test('重复点击的旧版本被拒绝',t=>{const s=setup(t);s.save(input,0);assert.throws(()=>s.save(input,0),/已变化/);});
test('目标不符、需确认模式不会放行发送',t=>{const s=setup(t);s.save({...input,mode:'confirm-new'},0);s.verify({codexIdentity:true,dshIdentity:true},1);s.transition('enable',2);assert.throws(()=>s.assertCanSend('d2'),/不一致/);assert.throws(()=>s.assertCanSend('d1'),/真人批准/);});
test('不能将身份核对记为投递通过或后台已启用',t=>{const s=setup(t);s.save(input,0);const b=s.verify({codexIdentity:true,dshIdentity:true,codexDelivery:true,backgroundRouter:true},1);assert.equal(b.verification.codexDelivery,false);assert.equal(b.verification.dshDelivery,false);assert.equal(b.verification.backgroundRouter,false);});
