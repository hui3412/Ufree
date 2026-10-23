import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker from '../backend/worker.mjs';
import {fixture} from './helpers/cloud-db.mjs';
import {CloudStorage} from '../backend/cloud-storage.mjs';
const person=(course='Calculus')=>({semester:'Fall 2026',source_file:'picture',classes:[{day:'Monday',start:'09:00',end:'10:00',course,course_code:'201',room:'A-1',instructor:'Full Teacher Name'}]});
test('signup attaches exactly one complete personal schedule and a distinct nickname; username stays immutable',async()=>{
 const f=fixture();try{
 const body={username:'signup_test',password:'fictional-password-123',school:'collegeahuntsic',personalSchedule:'Personal',people:{Personal:person()},nickname:'Tom',consent:true};
 const response=await f.call(null,'/auth/signup',body);assert.equal(response.status,201);assert.equal(response.data.user.nickname,'Tom');assert.equal(response.data.user.modelVersion,2);
 const user={...response.data.user,token:response.data.token};
 const delta=await f.call(user,'/sync?since=0');assert.equal(delta.status,200);assert.deepEqual(delta.data.changes.find(x=>x.name==='p:Personal').value,person());assert.deepEqual(delta.data.changes.find(x=>x.name==='@profile').value,{nickname:'Tom'});
 assert.deepEqual(f.sql.prepare('SELECT name FROM records WHERE user_id=? ORDER BY name').all(user.id).map(x=>x.name),['@profile','p:Personal']);
 const login=await f.call(null,'/auth/login',{username:body.username,password:body.password});assert.equal(login.status,200);assert.equal(login.data.user.nickname,'Tom');
 assert.equal((await f.call(user,'/profile/personal-schedule',{name:'Other',expected:'Personal'})).status,410);
 assert.equal((await f.call(null,'/auth/signup',{...body,username:'bad_more',people:{Personal:person(),Friend:person()}})).status,400);
 }finally{f.sql.close();}
});
test('every class requires course, day, valid times and end after start; extra cloud schedules and own deletion are rejected',async()=>{
 const f=fixture();try{
 const a=await f.seed('validations');await f.update(a,'Personal',person());
 for(const patch of [{course:''},{course:'   '},{day:''},{start:''},{end:''},{start:'25:00'},{end:'08:00'}])assert.equal((await f.update(a,'Personal',{classes:[{...person().classes[0],...patch}]})).status,400);
 assert.equal((await f.update(a,'Friend',person())).status,400);
 assert.equal((await f.update(a,'Personal',null)).status,400);
 assert.equal((await f.call(a,'/sync',{baseRevision:await f.revision(a),changes:[{name:'@profile',value:{nickname:'x'.repeat(61)}}]})).status,400);
 assert.equal((await f.call(a,'/sync',{baseRevision:await f.revision(a),changes:[{name:'@preferences',value:{people:person()}}]})).status,400);
 const current=await f.call(a,'/sync?since=0');assert.deepEqual(current.data.changes.find(x=>x.name==='p:Personal').value,person());
 }finally{f.sql.close();}
});
test('snapshot APIs return 410 without querying D1, and snapshot tables are removed',async()=>{
 const f=fixture();try{
 f.db.queries=0;
 for(const path of ['/shares','/shares/'+'a'.repeat(64),'/deliveries','/deliveries/respond']){assert.equal((await f.call(null,path)).status,410);assert.equal((await f.call(null,path,{})).status,410);}
 for(const path of ['/','/health'])assert.equal((await f.call(null,path)).status,200);
 assert.equal(f.db.queries,0);
 assert.deepEqual(f.sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('shares','deliveries','cloud_share_repair')").all(),[]);
 }finally{f.sql.close();}
});
test('only mutual followers see attached schedules; edits and nicknames propagate, removal and blocking revoke both directions',async()=>{
 const f=fixture();try{
 const a=await f.seed('alice_follow'),b=await f.seed('bob_follow'),c=await f.seed('private_third');
 for(const u of [a,b,c])assert.equal((await f.update(u,'Personal',person(u.username))).status,200);
 const req=await f.call(a,'/connections/request',{username:b.username,sharePersonal:true});assert.equal(req.status,200);
 assert.equal((await f.call(b,'/connections/inbox')).data.followRequests.length,1);
 assert.equal((await f.call(b,'/sync?since=0')).data.changes.some(x=>x.name==='f:'+a.id),false);
 assert.equal((await f.call(b,'/connections/respond',{id:req.data.id,decision:'accepted',sharePersonal:true})).status,200);
 const before=await f.revision(b);
 assert.equal((await f.call(a,'/sync',{baseRevision:await f.revision(a),changes:[{name:'p:Personal',value:person('New course')},{name:'@profile',value:{nickname:'Alice nickname'}}]})).status,200);
 const delta=await f.call(b,'/sync?since='+before);assert.equal(delta.status,200);assert.equal(delta.data.changes.find(x=>x.name==='f:'+a.id).value.nickname,'Alice nickname');assert.equal(delta.data.changes.find(x=>x.name==='f:'+a.id).value.person.classes[0].course,'New course');
 assert.equal((await f.call(c,'/sync?since=0')).data.changes.some(x=>x.name.startsWith('f:')),false);
 assert.equal((await f.call(b,'/connections')).data.connections[0].nickname,'Alice nickname');
 assert.equal((await f.call(b,'/blocks',{username:a.username,blocked:true})).status,200);
 assert.equal((await f.call(b,'/sync?since=0')).data.changes.find(x=>x.name==='f:'+a.id).value,null);
 assert.equal((await f.call(a,'/sync?since=0')).data.changes.find(x=>x.name==='f:'+b.id).value,null);
 }finally{f.sql.close();}
});
test('concurrent profile edits use server revisions and cannot overwrite an unseen update; own schedule storage is shared losslessly',async()=>{
 const f=fixture();try{
 const a=await f.seed('race_a'),b=await f.seed('race_b');for(const u of [a,b])await f.update(u,'Personal',person());
 const refs=f.sql.prepare("SELECT payload FROM records WHERE name='p:Personal'").all();assert.equal(refs[0].payload,refs[1].payload);
 const revision=await f.revision(a);assert.equal((await f.update(a,'Personal',person('Edited'))).status,200);
 assert.equal((await f.call(a,'/sync',{baseRevision:revision,changes:[{name:'p:Personal',value:person('Stale')}]})).status,409);
 assert.deepEqual((await f.call(b,'/sync?since=0')).data.changes[0].value,person());
 f.sql.exec('UPDATE cloud_objects SET last_used=0');await new CloudStorage(f.db).collect();assert.deepEqual((await f.call(b,'/sync?since=0')).data.changes[0].value,person());
 }finally{f.sql.close();}
});
test('authorized reset removes old accounts, sessions, uploads and objects and leaves a usable attached-schedule schema',async()=>{
 const f=fixture({through:'0006_complete_cloud_shares.sql'});try{
 const a=await f.seed('old_testing');f.sql.prepare('INSERT INTO records VALUES(?,?,?,1)').run(a.id,'p:Friend',JSON.stringify(person()));
 f.sql.prepare('INSERT INTO shares VALUES(?,?,?,?,?)').run('old_snapshot',a.id,JSON.stringify({Friend:person()}),1,2);
 f.sql.exec(fs.readFileSync(new URL('../backend/migrations/0007_attached_accounts.sql',import.meta.url),'utf8'));
 for(const table of ['users','records','sessions','cloud_objects','cloud_edges','cloud_chunks'])assert.equal(f.sql.prepare('SELECT count(*) AS n FROM '+table).get().n,0);
 assert.equal((await f.call(a,'/revision')).status,401);
 const b=await f.seed('after_reset');assert.equal((await f.update(b,'Personal',person())).status,200);
 }finally{f.sql.close();}
});
