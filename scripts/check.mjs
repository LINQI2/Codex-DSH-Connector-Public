import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import process from 'node:process';
import {root} from '../src/config.mjs';
let links=0,modules=0;
function walk(dir){for(const d of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,d.name);if(d.isDirectory()){if(!['.runtime','.git','node_modules'].includes(d.name))walk(p);}else if(d.name.endsWith('.md')){for(const m of fs.readFileSync(p,'utf8').matchAll(/\]\(([^)]+)\)/g)){const ref=m[1];if(/^(https?:|#)/.test(ref))continue;if(!fs.existsSync(path.resolve(path.dirname(p),ref.split('#')[0])))throw Error('失效链接：'+p+' -> '+ref);links++;}}else if(d.name.endsWith('.mjs')&&!p.includes(path.sep+'history'+path.sep)){const r=spawnSync(process.execPath,['--check',p],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);modules++;}}}
walk(root);console.log(JSON.stringify({validLocalLinks:links,syntaxCheckedModules:modules,modelCalls:0}));
