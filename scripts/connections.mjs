import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {root,loadConfig} from '../src/config.mjs';
import {connect} from '../src/client.mjs';
import {startConnections} from '../src/connections-server.mjs';
import {serviceControl} from '../src/service-control.mjs';
import {Workspaces} from '../src/workspaces.mjs';
import {Dispatcher} from '../src/dispatch.mjs';
import {codexPermission} from '../src/permission-view.mjs';
import {codexIndex} from '../src/session-catalog.mjs';
import {EvaluationStore} from '../src/evaluation/store.mjs';
import {EvaluationCollector} from '../src/evaluation/collector.mjs';
import {nativeSourceFor} from '../src/evaluation/native-source.mjs';
import {codexSourceFor} from '../src/evaluation/codex-source.mjs';
import {serviceAudit} from '../src/service-audit.mjs';
const runtime=path.join(root,'.runtime');
const audit=serviceAudit({runtime,name:'connections'});
const workspaces=new Workspaces(loadConfig());
const dispatcher=new Dispatcher(runtime,{clientFor:async dsh=>connect(workspaces.configFor(dsh))});
const catalogProvider=()=>{
 const c=JSON.parse(fs.readFileSync(path.join(runtime,'codex-catalog.json'),'utf8'));
 const directories=[...new Set([...c.threads.filter(t=>t.hostId==='local').map(t=>t.cwd),...workspaces.projects().map(p=>p.path)].filter(Boolean))];
 const current=codexIndex(path.join(process.env.USERPROFILE,'.codex','state_5.sqlite'),directories);
 return {...current,threads:current.threads.map(row=>{const old=c.threads.find(t=>t.threadId===row.threadId&&t.hostId===row.hostId);return {...row,permissionView:old?.permissionLog?codexPermission(old.permissionLog,row.threadId):row.permissionView};})};
};
let evaluation;
try{
 const store=new EvaluationStore(runtime);
 const collector=new EvaluationCollector({store,runtime,sourceFor:nativeSourceFor(workspaces),codexFor:codexSourceFor({home:path.join(process.env.USERPROFILE,'.codex'),catalogProvider})});evaluation={store,collector};collector.start();
}catch{console.error('评估账本暂不可用；原连接与任务发送继续可用。');}
const ui=await startConnections({runtime,html:path.join(root,'web','connections.html'),catalogProvider,dshProvider:()=>workspaces.candidates(),workspaces,dispatcher,evaluation});
fs.writeFileSync(path.join(runtime,'connections-ui.json'),JSON.stringify({url:ui.url,pid:process.pid,startedAt:new Date().toISOString()}));
console.log('连接设置页已启动（仅127.0.0.1），入口存于.runtime/connections-ui.json；不启动模型或自动路由。');
let stopping=false;async function stop(){if(stopping)return;stopping=true;await evaluation?.collector.stop();evaluation?.store.close();ui.server.closeAllConnections();await new Promise(r=>ui.server.close(r));process.exit(0);}
await serviceControl({runtime,name:'connections',stop,onStopRequest:()=>audit.requestStop('control-api'),canStop:()=>workspaces.close()});
audit.record('service-ready');
process.on('SIGINT',()=>{audit.requestStop('SIGINT');stop();});process.on('SIGTERM',()=>{audit.requestStop('SIGTERM');stop();});
// No timed model work. Explicit launcher stop closes only this owned service.
