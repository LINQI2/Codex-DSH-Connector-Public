// Fixed no-model command using the installed official Windows ACL runner.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {spawn} from 'node:child_process';
import {root,loadConfig} from '../src/config.mjs';
const c=loadConfig(),fixture=path.join(root,'fixtures','file-task-20261031'),temp=path.join(root,'.runtime','file-task-temp','dsh-task-20261031'),out=path.join(root,'.runtime','file-task-evidence');
if(!fs.existsSync(path.join(out,'security-baseline.json')))throw Error('Missing security baseline');
const runner=path.resolve(path.dirname(c.officialHost.entry),'../../dsh-sandbox-windows-acl/lib/runner.js');
const args=[runner,'--workspace',fixture,'--temp',temp,'--mode','workspace-write','--',process.execPath,'-e','console.log("NATIVE_SAFE_COMMAND_OK");process.exit(0)'];
const child=spawn(process.execPath,args,{cwd:fixture,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,TEMP:temp,TMP:temp}});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
const timeout=setTimeout(()=>child.kill(),30000);const result=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(exitCode,signal)=>resolve({exitCode,signal,stdout,stderr}));});clearTimeout(timeout);
const file=path.join(out,'native-probe-'+Date.now()+'.json');fs.writeFileSync(file,JSON.stringify({at:new Date().toISOString(),runner,workspace:fixture,...result},null,2));console.log(JSON.stringify(result));process.exitCode=result.exitCode??1;
