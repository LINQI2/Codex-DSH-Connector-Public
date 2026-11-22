// Unwrap the official backend's aggregate initialization error for one owned temp directory.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {root,loadConfig} from '../src/config.mjs';
const c=loadConfig(),fixture=path.join(root,'fixtures','file-task-20261031'),temp=path.join(root,'.runtime','file-task-temp','dsh-task-20261031');fs.mkdirSync(temp,{recursive:true});
const module=path.resolve(path.dirname(c.officialHost.entry),'../../dsh-sandbox-windows-acl/lib/index.js');const {AclSandbox,workspaceWriteSid,tempWriteSid}=await import(pathToFileURL(module).href);
const sandbox=new AclSandbox({writableDirs:[fixture],tempDir:temp,mode:'workspace-write',writeSid:workspaceWriteSid(fs.realpathSync.native(fixture)),tempWriteSid:tempWriteSid(temp)});
const describe=e=>({name:e.name,message:e.message,...(e.errors?{errors:e.errors.map(describe)}:{}),...(e.cause?{cause:describe(e.cause)}:{})});
let result;
try{await sandbox.init();result={initialized:true};}catch(e){result={initialized:false,error:describe(e)};}finally{try{sandbox.dispose();}catch(e){result.cleanup=describe(e);}}
fs.writeFileSync(path.join(root,'.runtime','file-task-evidence','temp-diagnosis.json'),JSON.stringify({temp,...result},null,2));console.log(JSON.stringify({temp,...result},null,2));
