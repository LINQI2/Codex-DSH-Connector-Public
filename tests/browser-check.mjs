// Optional real Chromium interaction test with explicit simulated providers.
// Uses an existing Playwright installation; never downloads browsers/packages.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {root} from '../src/config.mjs';
import {startConnections} from '../src/connections-server.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.CONNECTOR_PLAYWRIGHT_MODULE??'playwright');
fs.mkdirSync(path.join(root,'.runtime'),{recursive:true});
const runtime=fs.mkdtempSync(path.join(root,'.runtime','browser-fixture-'));
let fail=false,browser,ui;
try{
 ui=await startConnections({runtime,html:path.join(root,'web','connections.html'),catalogProvider:()=>({source:'browser-simulated',observedAt:new Date(Date.now()-3*24*60*60*1000).toISOString(),threads:[{threadId:'test-codex',hostId:'local',title:'浏览器测试规划会话',readVerified:true}]}),dshProvider:async()=>{if(fail)throw Error('模拟负责人不可用');return [{sessionId:'test-dsh',title:'浏览器测试执行会话',workspace:'D:\\test-fixture',running:false}];}});
 browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage({viewport:{width:1100,height:1000}});
 await page.goto(ui.url);await page.getByRole('status').filter({hasText:'请选择双方会话'}).waitFor();
 assert.match(await page.locator('#catalog-warning').textContent(),/记录较旧不会阻止/);await page.getByRole('button',{name:'保存连接',exact:true}).click();assert.equal(ui.store.read(),null);
 await page.getByLabel('连接名称').fill('浏览器验证连接');await page.locator('#codex-tree .session-choice').first().click();await page.locator('#dsh-tree .session-choice').first().click();
 await page.getByRole('button',{name:'保存连接',exact:true}).click();await page.getByRole('status').filter({hasText:'连接已保存'}).waitFor();assert.equal(ui.store.read().state,'draft');
 await page.getByRole('button',{name:'检查双方会话身份'}).click();await page.getByRole('status').filter({hasText:'双方身份已核对'}).waitFor();assert.equal(ui.store.read().state,'verified');
 await page.getByRole('button',{name:'允许按此连接发送'}).click();await page.getByRole('status').filter({hasText:'允许后续明确发送'}).waitFor();assert.equal(ui.store.read().state,'enabled');
 await page.getByRole('button',{name:'暂停后续发送'}).click();await page.getByRole('status').filter({hasText:'后续发送已暂停'}).waitFor();assert.equal(ui.store.read().state,'paused');
 await page.getByLabel('连接名称').fill('尚未保存的修改');assert.equal(await page.getByRole('button',{name:'检查双方会话身份'}).isDisabled(),true);
 await page.getByRole('button',{name:'刷新列表'}).click();await page.getByRole('status').filter({hasText:'列表已刷新'}).waitFor();assert.equal(await page.getByLabel('连接名称').inputValue(),'浏览器验证连接');
 fail=true;await page.getByRole('button',{name:'检查双方会话身份'}).click();await page.getByRole('status').filter({hasText:'模拟负责人不可用'}).waitFor();assert.equal(ui.store.read().state,'paused');
 fail=false;await page.getByRole('button',{name:'断开连接',exact:true}).click();await page.getByRole('status').filter({hasText:'已断开连接'}).waitFor();assert.equal(ui.store.read().state,'disconnected');
 await page.getByText('专业维护与旧验证工具（通常不用）',{exact:true}).click();await page.getByRole('button',{name:'停用本地自动答复',exact:true}).click();await page.getByRole('status').filter({hasText:'本地自动答复已停用'}).waitFor();assert.ok((await page.locator('#receiving-label').textContent()).includes('关闭'));
 await page.screenshot({path:path.join(root,'.runtime','connections-browser-test.png'),fullPage:true});
 console.log(JSON.stringify({browser:'real Chromium',providers:'simulated',modelCalls:0,checks:['空提交不保存','双方选择并保存','核对身份','明确启用','暂停','未保存修改禁止检查','刷新恢复保存内容','负责人不可用显示失败且不放行','断开保留会话记录','停用本地自动答复如实显示关闭'],passed:true}));
}finally{await browser?.close();if(ui){ui.server.closeAllConnections();await new Promise(r=>ui.server.close(r));}assert.ok(path.resolve(runtime).startsWith(path.join(root,'.runtime','browser-fixture-')));fs.rmSync(runtime,{recursive:true});}
