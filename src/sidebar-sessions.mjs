import path from 'node:path';
export function sidebarSessions(items,baseline,workspace){
 const group=baseline.items.find(x=>path.resolve(x.path)===path.resolve(workspace));
 if(!group)return [];
 const archived=new Set(baseline.archivedSessionIds??[]),byId=new Map(items.map(x=>[x.sessionId,x]));
 return group.sessionIds.map(id=>byId.get(id)).filter(s=>s&&!archived.has(s.sessionId)&&s.blank!==true&&path.resolve(s.cwd??'')===path.resolve(workspace));
}
