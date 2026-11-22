// Recover only the browser assertion against the existing completed Session.
// No create/prompt/retry of the model task; temporary scoped Host is reclaimed.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {createHash} from 'node:crypto';
import {root,loadConfig} from '../src/config.mjs';import {Workspaces} from '../src/workspaces.mjs';import {webApi} from '../src/web-api.mjs';
const out=path.join(root,'.runtime','daily-real-task'),task=JSON.parse(fs.readFileSync(path.join(out,'result.json'))),w=new Workspaces(loadConfig());if(task.state!=='ended')throw Error('原任务未确认结束，禁止猜测恢复');
const binding=path.join(root,'.runtime','binding.json'),hash=()=>createHash('sha256').update(fs.readFileSync(binding)).digest('hex'),before=hash();let browser,prepared=false;
try{
 await w.prepare('file-fixture');prepared=true;const ready=JSON.parse(fs.readFileSync(w.read().readyFile)),rpc=await webApi(w.read().readyFile);const list=await rpc('session/list',{_request:{}}),s=list.items.find(x=>x.sessionId===task.sessionId);assert.ok(s);assert.equal(s.running,false);
 const {chromium}=createRequire(import.meta.url)(process.env.CONNECTOR_PLAYWRIGHT_MODULE);browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage({viewport:{width:1350,height:1050}});await page.goto(ready.authUrl);await page.waitForTimeout(3000);const welcome=page.getByRole('button',{name:'继续',exact:true});if(await welcome.isVisible())await welcome.click();
 const title=s.projections.values.title;assert.ok(title);await page.getByText(title,{exact:true}).first().click();
 // Match stable rendered prose; markdown backticks are not DOM text.
 await page.getByText('已按任务要求原样执行一次命令：',{exact:false}).first().waitFor({timeout:20000});
 const body=await page.locator('body').innerText();assert.ok(body.includes('summary.test.mjs'));assert.ok(/退出码/.test(body));await page.screenshot({path:path.join(out,'native-result-reviewed.png'),fullPage:true});
 // Open the native execution disclosure, leaving the trace in the native UI.
 const disclosure=page.getByText(/已完成，用时/).first();if(await disclosure.isVisible()){await disclosure.click();await page.screenshot({path:path.join(out,'native-process-reviewed.png'),fullPage:true});}
 const state=w.read();await w.close();prepared=false;const security=JSON.parse(fs.readFileSync(path.join(root,'.runtime',state.evidence,'cleanup-verified.json')));assert.deepEqual(security.errors,[]);assert.equal(hash(),before);
 const result={at:new Date().toISOString(),sessionId:s.sessionId,seq:s.projections.asOfSeq,title,nativeHistoryVisible:true,originalBindingUnchanged:true,modelCalls:0,modelResent:false,cleanupObjects:security.objects,cleanupErrors:security.errors,evidence:state.evidence,note:'完成记录重开阅读通过；首次即时显示断言未通过，未追认其通过。'};fs.writeFileSync(path.join(out,'browser-review.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser?.close();if(prepared)await w.close();}
