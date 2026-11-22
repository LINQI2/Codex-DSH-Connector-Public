// One bounded real MCP question test. Never retries or starts game work.
import fs from 'node:fs';
import path from 'node:path';
import {root} from '../src/config.mjs';
import {routing} from '../src/routing.mjs';
const file=path.join(root,'.runtime','route-validation.json');
if(fs.existsSync(file))throw Error('已有验证投递尝试；先核对，不重复调用模型');
const {client,binding}=await routing();if((await client.inspect()).running)throw Error('DSH会话仍在运行或等待');
const requestId='bridge-real-question-20261031-01';
fs.writeFileSync(file,JSON.stringify({requestId,sessionId:binding.dsh.sessionId,codexThreadId:binding.codex.threadId,state:'attempted',at:new Date().toISOString()}));
const text='进行一次明确标注的连接器原生工具链路验收，不是游戏研发。不要读写文件或调用其他工具。请向绑定的Codex技术负责人提出这一实际连接器设计问题：暂停连接期间的未答技术问题应丢弃还是保留，恢复后如何避免重复投递？用简明中文提出问题并给建议。必须使用已经接入的mcp__codex_bridge__ask_codex工具，id=q-route-20261031-01。该工具只登记技术问题，不是向制作人请求审批。工具返回后结束本轮并等待关联答复，不调用get工具或循环催促；若工具不存在或失败，直接说明真实错误并结束，不用其他方式绕过。本轮最多这一次提问，不新建会话。';
try{const receipt=await client.submit(requestId,text);fs.writeFileSync(file,JSON.stringify({requestId,sessionId:binding.dsh.sessionId,codexThreadId:binding.codex.threadId,state:'accepted',receipt,at:new Date().toISOString()}));console.log(JSON.stringify(receipt));}
catch(error){throw Error('投递结果需核对，禁止自动重试：'+error.message);}
