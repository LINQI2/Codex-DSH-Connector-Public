import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {receivingStatus,requestReceivingStop,assertAutomaticReceiving} from '../src/receiver.mjs';
test('后台记录区分关闭、登记待原生核对、停用、到期',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'native-receive-test-'));t.after(()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep+'native-receive-test-'));fs.rmSync(dir,{recursive:true});});
 assert.equal(receivingStatus(dir).state,'off');assert.throws(()=>assertAutomaticReceiving(dir),/未登记/);
 const file=path.join(dir,'receiving.json');fs.writeFileSync(file,JSON.stringify({status:'registered',automationId:'test',intervalMinutes:15,expiresAt:new Date(Date.now()+60000).toISOString()}));
 assert.equal(receivingStatus(dir).state,'registered-unconfirmed');assertAutomaticReceiving(dir);
 requestReceivingStop(dir);assert.equal(receivingStatus(dir).state,'stop-requested');assert.throws(()=>assertAutomaticReceiving(dir),/已停用/);
 fs.writeFileSync(file,JSON.stringify({status:'registered',automationId:'test',expiresAt:'2000-01-01T00:00:00Z'}));assert.equal(receivingStatus(dir).state,'off');assert.throws(()=>assertAutomaticReceiving(dir),/到期/);
});
