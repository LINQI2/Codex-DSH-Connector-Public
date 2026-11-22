import process from 'node:process';
import {routing} from '../src/routing.mjs';
import path from 'node:path';
import {root} from '../src/config.mjs';
import {assertAutomaticReceiving} from '../src/receiver.mjs';
const action=process.argv[2]??'pending';
if(process.argv.includes('--automatic'))assertAutomaticReceiving(path.join(root,'.runtime'));
const {box,client,binding}=await routing();
if(action==='pending')console.log(JSON.stringify({codexThreadId:binding.codex.threadId,questions:box.pending()},null,2));
else if(action==='answer'){const id=process.argv[3],text=process.argv[4];console.log(JSON.stringify(await box.answer(id,text,client),null,2));}
else if(action==='get')console.log(JSON.stringify(box.get(process.argv[3]),null,2));
else throw Error('仅支持 pending、answer <id> <答复>、get <id>');
