// Manual real-Host UI check. It opens full-access confirmation and CANCELS it.
// Never enables a preset, sends a prompt, or runs a model/task.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {createHash} from 'node:crypto';
import {root,loadConfig} from '../src/config.mjs';import {webApi} from '../src/web-api.mjs';
const c=loadConfig(),bindingFile=path.join(root,'.runtime/binding.json'),bindingBytes=fs.readFileSync(bindingFile),b=JSON.parse(bindingBytes),rpc=await webApi(c.hostReadyFile);
const list=await rpc('session/list',{_request:{}});assert.ok(!list.items.some(s=>s.running),'Do not inspect menu during active work');const current=list.items.find(s=>s.sessionId===b.dsh.sessionId);assert.equal(current.cwd,b.dsh.workspace);
const permissions=items=>items.map(s=>[s.sessionId,s.projections?.values?.permissions?.currentValue]).sort((a,b)=>a[0].localeCompare(b[0]));const before=permissions(list.items);
const {chromium}=createRequire(import.meta.url)(process.env.CONNECTOR_PLAYWRIGHT_MODULE);const browser=await chromium.launch({channel:'chrome',headless:true});
const evidence=path.join(root,'.runtime/full-permission-menu-evidence');fs.mkdirSync(evidence,{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1400,height:1000}});await page.goto(JSON.parse(fs.readFileSync(c.hostReadyFile,'utf8')).authUrl);
 await page.getByText(path.basename(current.cwd),{exact:true}).first().click();const row=page.getByText(current.projections.values.title,{exact:true}).first().locator('xpath=parent::*');await row.waitFor();await row.click();
 const trigger=page.getByRole('button',{name:/^访问模式，当前/});await trigger.waitFor();await trigger.click();
 const names=await page.getByRole('menuitem').allTextContents();for(const name of ['仅查看（只读）','项目内开发','完整访问（会话级）'])assert.ok(names.includes(name));
 await page.screenshot({path:path.join(evidence,'menu.png')});await page.getByRole('menuitem',{name:'完整访问（会话级）',exact:true}).click();
 const confirmation=page.getByText('确认启用完全权限？',{exact:true});await confirmation.waitFor();assert.equal(await page.getByRole('button',{name:'启用完全权限',exact:true}).isDisabled(),true);
 await page.screenshot({path:path.join(evidence,'confirmation-before-accept.png')});await page.getByRole('button',{name:'取消',exact:true}).click();await confirmation.waitFor({state:'hidden'});
 const after=await rpc('session/list',{_request:{}});assert.deepEqual(permissions(after.items),before);assert.equal(createHash('sha256').update(bindingBytes).digest('hex'),createHash('sha256').update(fs.readFileSync(bindingFile)).digest('hex'));
 const report={browser:'real Chrome',provider:'real official DSH Host',options:names,nativeConfirmationShown:true,enableDisabledBeforeAcknowledgement:true,cancelPreservesAllSessionPermissions:true,bindingUnchanged:true,boundPreset:current.projections.values.permissions.currentValue,modelCalls:0};fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
