import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Mailbox} from '../src/mailbox.mjs';
function setup(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'native-mail-test-'));t.after(()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep+'native-mail-test-'));fs.rmSync(dir,{recursive:true});});const box=new Mailbox(dir);box.bindings.save({name:'测试',mode:'autonomous',codex:{hostId:'local',threadId:'c'},dsh:{sessionId:'d',workspace:'D:\\fixture'}},0);box.bindings.verify({codexIdentity:true,dshIdentity:true},1);box.bindings.transition('enable',2);return box;}
const question={id:'q-test',question:'接口失败怎样核对？'},proof={sessionId:'d',callId:'call-1',seq:7};
test('提问需要准确绑定Session原生证据，同ID同内容去重',t=>{const b=setup(t);assert.throws(()=>b.submit(question,{...proof,sessionId:'other'}),/原生工具/);b.submit(question,proof);b.submit(question,proof);assert.equal(b.pending().length,1);assert.throws(()=>b.submit({...question,question:'另一问题'},proof),/内容冲突/);});
test('暂停和断开阻止新提问、答复读取',t=>{const b=setup(t);b.submit(question,proof);b.bindings.transition('pause',3);assert.throws(()=>b.pending(),/暂停/);assert.throws(()=>b.submit({id:'q-new',question:'测试'},proof),/暂停/);});
test('回复有稳定关联和真实accepted，不能重复回复',async t=>{const b=setup(t);b.submit(question,proof);let sent;const c={inspect:async()=>({running:false}),submit:async(id,text)=>{sent={id,text};return {accepted:true};}};assert.equal((await b.answer('q-test','先核对原生记录',c)).state,'accepted');assert.ok(sent.text.includes('q-test'));assert.ok(sent.text.includes('不是制作人的新授权'));await assert.rejects(()=>b.answer('q-test','重复',c),/答复尝试/);});
test('超时记unknown，不盲重试',async t=>{const b=setup(t);b.submit(question,proof);let calls=0;const c={inspect:async()=>({running:false}),submit:async()=>{calls++;throw Error('timeout');}};await assert.rejects(()=>b.answer('q-test','答复',c),/timeout/);assert.equal(b.get('q-test').state,'unknown');await assert.rejects(()=>b.answer('q-test','答复',c),/答复尝试/);assert.equal(calls,1);});
test('新工作包需确认不阻止已有技术问题答复',async t=>{const b=setup(t);const old=b.bindings.read();b.bindings.save({...old,mode:'confirm-new'},3);b.bindings.verify({codexIdentity:true,dshIdentity:true},4);b.bindings.transition('enable',5);b.submit(question,proof);assert.equal(b.pending().length,1);});
