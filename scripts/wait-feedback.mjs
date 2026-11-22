import {waitForConfiguredFeedback} from '../src/feedback-wait.mjs';
const options={},controller=new AbortController();
const cancel=()=>controller.abort();process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
try{
 const args=process.argv.slice(2),names={'--codex-thread':'expectedThread','--workspace':'expectedWorkspace','--wait-ms':'waitMs','--after-seq':'afterSeq'};
 for(let i=0;i<args.length;i++){const name=names[args[i]];if(!name||!args[i+1])throw Error('参数无效');const value=args[++i];options[name]=['waitMs','afterSeq'].includes(name)?Number(value):value;}
 console.log(JSON.stringify(await waitForConfiguredFeedback({...options,signal:controller.signal}),null,2));
}catch{console.error('等待未建立：请核对参数、绑定与本机服务；未发送模型消息、未修改权限、未输出私有异常。');process.exitCode=2;}
finally{process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);}
