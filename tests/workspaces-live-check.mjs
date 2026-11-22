// Explicit real integration: native Web services + scoped metadata preparation.
// Creates one empty Session, never sends a model prompt or changes the binding.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {createHash} from 'node:crypto';
import {root,loadConfig} from '../src/config.mjs';import {connect} from '../src/client.mjs';
const noCreate=process.argv.includes('--no-create');
const runtime=path.join(root,'.runtime'),out=path.join(runtime,'daily-entry-evidence');fs.mkdirSync(out,{recursive:true});
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),bindingFile=path.join(runtime,'binding.json'),before=hash(bindingFile);
const original=await(await connect(loadConfig())).inspect();
const {chromium}=createRequire(import.meta.url)(process.env.CONNECTOR_PLAYWRIGHT_MODULE);const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1150,height:1100}});let prepared=false;
try{
 await page.goto(JSON.parse(fs.readFileSync(path.join(runtime,'connections-ui.json'),'utf8')).url);await page.getByRole('status').filter({hasText:'请选择双方会话'}).waitFor();
 await page.getByText('专业维护与旧验证工具（通常不用）',{exact:true}).click();await page.getByLabel('工作目录',{exact:true}).selectOption('file-fixture');await page.getByRole('button',{name:'准备所选工作区',exact:true}).click();
 await page.getByRole('status').filter({hasText:'工作区已准备'}).waitFor({timeout:60000});prepared=true;
 const state=JSON.parse(fs.readFileSync(path.join(runtime,'managed-workspace.json')));assert.equal(state.state,'ready');
 if(!noCreate){await page.getByRole('button',{name:'创建空白DSH会话',exact:true}).click();await page.getByRole('status').filter({hasText:'空白会话已创建'}).waitFor({timeout:30000});assert.equal(await page.getByRole('button',{name:'检查双方会话身份'}).isDisabled(),true);}
 assert.equal(hash(bindingFile),before);
 const ready=JSON.parse(fs.readFileSync(state.readyFile));const native=await browser.newPage();await native.goto(ready.authUrl);await native.waitForTimeout(3000);const welcome=native.getByRole('button',{name:'继续',exact:true});if(await welcome.isVisible())await welcome.click();await native.getByText('file-task-20261031',{exact:true}).first().waitFor();await native.screenshot({path:path.join(out,'native-empty-session.png')});
 await page.screenshot({path:path.join(out,'prepared.png'),fullPage:true});
 await page.getByRole('button',{name:'关闭开发工作区并回收权限',exact:true}).click();await page.getByRole('status').filter({hasText:'权限已核验恢复'}).waitFor({timeout:60000});prepared=false;
 const after=JSON.parse(fs.readFileSync(path.join(runtime,'managed-workspace.json')));assert.equal(after.state,'closed');const security=JSON.parse(fs.readFileSync(path.join(runtime,state.evidence,'cleanup-verified.json')));assert.deepEqual(security.errors,[]);assert.equal(security.security.filter(x=>x.labels.length).length,0);
 assert.equal(hash(bindingFile),before);const still=await(await connect(loadConfig())).inspect();assert.equal(still.sessionId,original.sessionId);assert.equal(still.projections.asOfSeq,original.projections.asOfSeq);assert.equal(still.projections.values.permissions.currentValue,'probe-read-only');
 const result={at:new Date().toISOString(),browser:'real Chrome',providers:'real local official DSH Web',modelCalls:0,createdSession:!noCreate,bindingUnchanged:true,originalSeq:still.projections.asOfSeq,originalPermission:still.projections.values.permissions.currentValue,workspaceState:after.state,recoveredObjects:security.objects,securityErrors:security.errors,evidence:state.evidence,checks:['选择限定目录','真实原生Host准备',...(!noCreate?['创建空白会话','未保存修改阻止检查']:[]),'官方网页可见','未自动改绑定','关闭空闲Host','回收权限','原会话和历史保持']};fs.writeFileSync(path.join(out,noCreate?'live-result-final.json':'live-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(error){fs.writeFileSync(path.join(out,'live-error.json'),JSON.stringify({error:error.message,prepared,at:new Date().toISOString()}));throw error;}
finally{await browser.close();if(prepared)console.error('真实工作区仍需通过设置页核对关闭；不强杀、不删除现场。');}
