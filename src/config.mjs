import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function validateConfig(c){
 if(!c||typeof c!=='object')throw Error('配置必须为对象');
 for(const k of ['hostReadyFile','expectedSessionId','expectedWorkspace'])if(typeof c[k]!=='string'||!c[k].trim())throw Error('缺少配置：'+k);
 if(!path.isAbsolute(c.hostReadyFile)||!path.isAbsolute(c.expectedWorkspace))throw Error('配置必须使用绝对路径');
 return c;
}
export function validateHost(ready){
 const u=new URL(ready.authUrl);
 if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||u.origin!==ready.url||u.pathname!=='/'||!u.searchParams.get('token'))throw Error('只允许准确匹配、带官方启动认证的127.0.0.1 Host');
 return u;
}
export function loadConfig(){return validateConfig(JSON.parse(fs.readFileSync(path.join(root,'config','local.json'),'utf8')));}
