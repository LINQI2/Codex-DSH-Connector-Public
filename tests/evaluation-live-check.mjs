// Real deployed settings service, GET only. Never registers a real task or sends a prompt.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {createHash} from 'node:crypto';import {root} from '../src/config.mjs';
const runtime=path.join(root,'.runtime'),ready=JSON.parse(fs.readFileSync(path.join(runtime,'connections-ui.json'))),binding=path.join(runtime,'binding.json'),hash=()=>createHash('sha256').update(fs.readFileSync(binding)).digest('hex'),before=hash();
const {chromium}=createRequire(import.meta.url)(process.env.CONNECTOR_PLAYWRIGHT_MODULE);const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1250,height:1000}});await page.goto(ready.url);await page.getByRole('link',{name:'成本与时间评估',exact:true}).click();await page.getByRole('status').filter({hasText:'评估账本已读取'}).waitFor();
 const response=await page.request.get(ready.url+'api/evaluation');assert.equal(response.status(),200);const data=await response.json();assert.equal(hash(),before);assert.equal(await page.locator('#codex-tokens').isVisible(),true);assert.equal(await page.locator('#tokens').isVisible(),true);
 const dir=path.join(runtime,'evaluation-evidence');fs.mkdirSync(dir,{recursive:true});await page.screenshot({path:path.join(dir,'deployed-desktop.png'),fullPage:true});const result={browser:'real Chrome',service:'real deployed connector',readOnly:true,evaluationPageReachable:true,taskCount:data.tasks.length,bindingUnchanged:true,modelCalls:0};fs.writeFileSync(path.join(dir,'deployed-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
