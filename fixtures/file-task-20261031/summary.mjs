// 按连接统计待答、已受理和待核对的问题数量，并生成中文状态摘要。
export function summarizeQuestions(questions,bindingId,{paused=false}={}){
 const counts={pending:0,accepted:0,unknown:0};
 for(const question of questions){
  if(question.bindingId!==bindingId)continue;
  if(question.state==='pending'||question.state==='accepted'||question.state==='unknown')counts[question.state]++;
 }
 const parts=[];
 if(counts.pending)parts.push(`待答${counts.pending}项`);
 if(counts.accepted)parts.push(`已受理${counts.accepted}项`);
 if(counts.unknown)parts.push(`待核对${counts.unknown}项`);
 const label=parts.length?`${paused?'已暂停；':''}${parts.join('；')}`:paused?'已暂停':'没有待处理问题';
 return {...counts,label};
}
