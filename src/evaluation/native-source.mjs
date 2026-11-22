import {createRequire} from 'node:module';
import {webApi} from '../web-api.mjs';
export function nativeSourceFor(workspaces){return async target=>{
 const config=workspaces.configFor(target);let rpc;
 try{rpc=await webApi(config.hostReadyFile);}catch{throw Error('DSH只读统计来源暂不可用；请核对原生客户端连接，不重发任务');}
 const WebSocket=createRequire(config.officialHost.entry)('ws');
 return {inspect:async()=>{let list;try{list=await rpc('session/list',{_request:{}});}catch{throw Error('DSH只读会话查询失败；未执行任何模型操作');}const s=list.items.find(s=>s.sessionId===target.sessionId);if(!s)throw Error('会话不可读取');return s;},follow:callbacks=>rpc.followSession(WebSocket,target.sessionId,callbacks)};
};}
