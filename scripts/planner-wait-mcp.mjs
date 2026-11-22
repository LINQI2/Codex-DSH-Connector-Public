import readline from 'node:readline';
import {plannerWaitHandler} from '../src/planner-wait-mcp.mjs';
import {waitForConfiguredFeedback} from '../src/feedback-wait.mjs';
const handler=plannerWaitHandler({wait:waitForConfiguredFeedback,reply:message=>process.stdout.write(JSON.stringify(message)+'\n')});
const input=readline.createInterface({input:process.stdin});
input.on('line',line=>{if(Buffer.byteLength(line)>16384)return;try{void handler.handle(JSON.parse(line));}catch{/* No private protocol payloads in logs. */}});
input.once('close',()=>handler.close());
process.once('SIGINT',()=>{handler.close();input.close();});process.once('SIGTERM',()=>{handler.close();input.close();});
