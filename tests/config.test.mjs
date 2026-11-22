import test from 'node:test';
import assert from 'node:assert/strict';
import {validateConfig,validateHost} from '../src/config.mjs';
test('缺失连接信息不猜测工程或会话',()=>assert.throws(()=>validateConfig({}),/缺少配置/));
test('拒绝相对工程路径',()=>assert.throws(()=>validateConfig({hostReadyFile:'relative.json',expectedSessionId:'x',expectedWorkspace:'relative'}),/绝对路径/));
test('允许准确的官方回环认证地址',()=>assert.equal(validateHost({authUrl:'http://127.0.0.1:12345/?token=test',url:'http://127.0.0.1:12345'}).hostname,'127.0.0.1'));
test('拒绝非回环Host',()=>assert.throws(()=>validateHost({authUrl:'http://192.0.2.1:12345/?token=test',url:'http://192.0.2.1:12345'}),/127.0.0.1/));
test('拒绝来源不一致',()=>assert.throws(()=>validateHost({authUrl:'http://127.0.0.1:12345/?token=test',url:'http://127.0.0.1:54321'}),/127.0.0.1/));
test('拒绝缺少官方启动token',()=>assert.throws(()=>validateHost({authUrl:'http://127.0.0.1:12345/',url:'http://127.0.0.1:12345'}),/127.0.0.1/));
