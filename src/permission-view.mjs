import fs from 'node:fs';
export function hasDevelopmentAccess(preset){return ['project-write','workspace-write','fixture-write','danger-full-access','full-access'].includes(preset);}
export function nativePermission(preset){
 if(['probe-read-only','read-only'].includes(preset))return {label:'只读',detail:'DSH当前原生会话：只读。'};
 if(['project-write','workspace-write','fixture-write'].includes(preset))return {label:'项目读写',detail:'DSH当前原生会话：工作区写入权限。实际工具执行仍受原生沙箱限制。'};
 if(['full-access','danger-full-access'].includes(preset))return {label:'完整访问',detail:'DSH当前原生会话：完整文件访问，持续至用户手动切回；可访问普通用户有权访问的工程外路径，不是管理员，也不代表所有业务操作已获授权。'};
 return {label:preset?'自定义权限':'未读取',detail:preset?'DSH当前原生权限：'+preset:'没有取得原生权限，不能推断。'};
}
export function codexPermission(file,id){
 try{let own=false,last;for(const line of fs.readFileSync(file,'utf8').split('\n')){try{const r=JSON.parse(line);if(r.type==='session_meta')own=r.payload.id===id;if(r.type==='turn_context')last=r;}catch{}}
  if(!own||!last)return {label:'未读取',detail:'没有匹配的Codex权限记录。'};
  const p=last.payload.sandbox_policy?.type,label={'read-only':'只读记录','workspace-write':'受限读写记录','danger-full-access':'完全访问记录','external-sandbox':'外部沙箱记录'}[p]??'权限待核对';
  return {label,detail:'Codex最近本机记录：'+(p??'未知')+'；记录时间：'+(Number.isFinite(Date.parse(last.timestamp))?new Date(last.timestamp).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})+'（北京时间）':'未记录')+'。这不是当前客户端设置的实时查询。',observedAt:last.timestamp};
 }catch{return {label:'未读取',detail:'Codex权限记录暂不可读，不推断权限。'};}
}
