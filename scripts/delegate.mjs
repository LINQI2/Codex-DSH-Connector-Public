import path from 'node:path';import {root,loadConfig} from '../src/config.mjs';import {Workspaces} from '../src/workspaces.mjs';import {connect} from '../src/client.mjs';import {delegate} from '../src/delegate.mjs';
const args=process.argv.slice(2),options={send:false};
try{
 const names={'--codex-thread':'expectedThread','--workspace':'expectedWorkspace','--task-file':'taskFile','--id':'id'};
 for(let i=0;i<args.length;i++){if(args[i]==='--send')options.send=true;else if(names[args[i]]&&args[i+1])options[names[args[i]]]=args[++i];else throw Error('参数无效');}
 const w=new Workspaces(loadConfig());
 const result=await delegate({...options,runtime:path.join(root,'.runtime'),clientFor:d=>connect(w.configFor(d))});console.log(JSON.stringify(result,null,2));
}catch(error){
 const message=String(error.message),reason=message.includes('运行目录写入被拒绝')?'当前执行环境不能写连接器运行目录，尚未发送；应申请普通用户宿主执行该连接器命令，不需要修改DSH权限':message.includes('待核对')?'有投递或投递锁待核对，禁止重复发送':message.includes('已有记录')?'稳定编号已有投递记录，不能重复发送':message.includes('读写权限')?'DSH尚未确认项目读写权限':message.includes('等待中')?'DSH或同工程正在运行/等待':message.includes('自主')||message.includes('人工审批')?'当前模式不允许自主委派，请使用既有人工确认入口':message.includes('不符')?'当前绑定不是指定会话或工程':message.includes('工程内')?'工作包路径不在绑定工程内':error.code==='ENOENT'?'工作包或本机配置不存在':message.includes('必须填写')||message.includes('参数无效')?'缺少或不支持的命令参数':'前置检查或官方连接失败，未确认投递结果';
 console.error('委派未完成：'+reason+'。运行npm run diagnose并核对原投递记录，不换编号重发；私有错误详情未输出。');process.exitCode=2;
}
