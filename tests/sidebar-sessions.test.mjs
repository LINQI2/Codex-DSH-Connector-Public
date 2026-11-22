import test from 'node:test';import assert from 'node:assert/strict';import {sidebarSessions} from '../src/sidebar-sessions.mjs';
test('沿用原生工作区顺序，排除空白、归档、移出工作区及目录错配记录',()=>{
 const make=(id,extra={})=>({sessionId:id,cwd:'D:\\game',blank:false,...extra});const rows=[make('old'),make('blank',{blank:true}),make('archived'),make('moved'),make('other',{cwd:'D:\\other'}),make('new')];const b={items:[{path:'D:\\game',sessionIds:['new','archived','blank','other','old']}],archivedSessionIds:['archived']};
 assert.deepEqual(sidebarSessions(rows,b,'D:\\game').map(x=>x.sessionId),['new','old']);assert.deepEqual(sidebarSessions(rows,b,'D:\\missing'),[]);assert.equal(rows.length,6);
});
