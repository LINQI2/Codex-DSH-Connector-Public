import path from 'node:path';
import {root,loadConfig} from '../src/config.mjs';
import {Workspaces} from '../src/workspaces.mjs';
import {webApi} from '../src/web-api.mjs';
import {diagnose,renderDiagnosis} from '../src/diagnose.mjs';
const args=process.argv.slice(2);let json=false,expectedThread,expectedWorkspace;
try{
 for(let i=0;i<args.length;i++){
  if(args[i]==='--json')json=true;
  else if(args[i]==='--codex-thread'&&args[i+1])expectedThread=args[++i];
  else if(args[i]==='--workspace'&&args[i+1])expectedWorkspace=args[++i];
  else throw Error('ARGUMENT');
 }
 const config=loadConfig(),w=new Workspaces(config);
 const report=await diagnose({runtime:path.join(root,'.runtime'),config,configFor:d=>w.configFor(d),rpcFor:webApi,expectedThread,expectedWorkspace});
 console.log(json?JSON.stringify(report,null,2):renderDiagnosis(report));
 if(report.blockers.length)process.exitCode=2;
}catch{console.error('只读核对未完成：请检查命令参数或请连接器维护者核对本机配置；未发送任务，未输出私有错误详情。');process.exitCode=2;}
