import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeQuestions} from './summary.mjs';
const rows=[{bindingId:'a',state:'pending'},{bindingId:'a',state:'accepted'},{bindingId:'a',state:'unknown'},{bindingId:'b',state:'pending'}];
test('按连接统计并区分待答、已受理、未知',()=>{assert.deepEqual(summarizeQuestions(rows,'a'),{pending:1,accepted:1,unknown:1,label:'待答1项；已受理1项；待核对1项'});});
test('暂停时保留数量，不把已受理说成完成',()=>{assert.deepEqual(summarizeQuestions(rows,'a',{paused:true}),{pending:1,accepted:1,unknown:1,label:'已暂停；待答1项；已受理1项；待核对1项'});});
test('空连接没有待处理问题',()=>{assert.deepEqual(summarizeQuestions(rows,'other'),{pending:0,accepted:0,unknown:0,label:'没有待处理问题'});});
