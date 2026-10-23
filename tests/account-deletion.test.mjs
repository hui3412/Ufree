import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {fixture} from './helpers/cloud-db.mjs';
import {CloudStorage} from '../backend/cloud-storage.mjs';
import {passwordHash} from '../backend/worker.mjs';
const password='fictional-delete-password-123';
const storedHash=await passwordHash(password);
const person=course=>({semester:'Fall 2026',classes:[{day:'Monday',start:'09:00',end:'10:00',course,room:'A-1',instructor:'Test Teacher'}]});
async function seed(f,name){const user=await f.seed(name);f.sql.prepare('UPDATE users SET password_hash=? WHERE id=?').run(storedHash,user.id);return user;}
const remove=(f,user,extra={})=>f.call(user,'/auth/delete',{currentPassword:password,confirmUsername:user.username,...extra});
const read=(f,user)=>f.call(user,'/sync?since=0');
const count=(f,table,where='',...args)=>f.sql.prepare(`SELECT count(*) AS n FROM ${table} ${where}`).get(...args).n;
async function follow(f,a,b){
 const request=await f.call(a,'/connections/request',{username:b.username,sharePersonal:true});assert.equal(request.status,200);
 const pending=(await f.call(b,'/deliveries')).data.followRequests.find(r=>r.sender===a.username);
 assert.equal((await f.call(b,'/connections/respond',{id:pending.id,decision:'accepted',sharePersonal:true})).status,200);
}
test('account deletion removes ownership, links, sessions and live relationships without damaging shared objects or other accounts',async()=>{
 const f=fixture();
 try{
  const a=await seed(f,'delete_owner'),b=await seed(f,'keep_owner'),c=await seed(f,'keep_peer');
  const common=person('Shared timetable');
  const privateA={...person('Only departing account'),note:randomBytes(100000).toString('hex')};
  const retained=person('Retained by another owner’s snapshot');
  for(const user of [a,b,c])assert.equal((await f.update(user,'Personal',common)).status,200);
  assert.equal((await f.update(a,'Only A',privateA)).status,200);
  assert.equal((await f.update(a,'Snapshot copy',retained)).status,200);
  assert.equal((await f.update(b,'Only B',person('B private'))).status,200);
  const sharedRef=f.sql.prepare("SELECT payload FROM records WHERE user_id=? AND name='p:Personal'").get(a.id).payload;
  assert.equal(f.sql.prepare("SELECT payload FROM records WHERE user_id=? AND name='p:Personal'").get(b.id).payload,sharedRef);
  const privateRef=f.sql.prepare("SELECT payload FROM records WHERE user_id=? AND name='p:Only A'").get(a.id).payload;
  assert.ok(count(f,'cloud_chunks','WHERE object_id=?',privateRef.slice(5))>0,'test includes chunked exclusive data');
  const owned=(await f.call(a,'/shares',{people:{Shared:common,Private:privateA}})).data;
  const kept=(await f.call(b,'/shares',{people:{Retained:retained}})).data;
  assert.equal((await f.call(a,'/deliveries',{username:b.username,people:{Private:privateA},confirmed:true})).status,201);
  assert.equal((await f.call(c,'/deliveries',{username:a.username,people:{Incoming:common},confirmed:true})).status,201);
  const deliveries=f.sql.prepare('SELECT * FROM deliveries').all();
  const shareId=owned.code.slice(5);
  f.sql.prepare("INSERT INTO cloud_share_repair(target,row_key) VALUES('shares',?)").run(shareId);
  for(const row of deliveries){
   f.sql.prepare("INSERT INTO cloud_share_repair(target,row_key) VALUES('deliveries',?)").run(row.id);
   f.sql.prepare("INSERT INTO cloud_repack(target,user_id,row_key) VALUES('deliveries',?,?)").run(row.sender_id,row.id);
  }
  await follow(f,a,b);await follow(f,b,c);
  const previousRevision=await f.revision(b);
  const others=f.sql.prepare("SELECT user_id,name,payload FROM records WHERE user_id<>? AND name LIKE 'p:%' ORDER BY user_id,name").all(a.id);
  const quotas=f.sql.prepare('SELECT id,storage_bytes FROM users WHERE id<>? ORDER BY id').all(a.id);
  f.sql.prepare("INSERT INTO blocks(user_id,blocked_id) VALUES(?,?)").run(a.id,c.id);
  f.sql.prepare("INSERT INTO attempts(key) VALUES(?)").run('password:'+a.id);
  f.sql.prepare("INSERT INTO rate_limits(key,window,count) VALUES(?,0,1)").run('search:'+a.id);
  f.sql.exec('UPDATE cloud_objects SET last_used=0');
  // An upload by another request is not yet attached to an account. Its lease must survive GC.
  const inFlight=await new CloudStorage(f.db).prepare(person('Upload still in progress'),{schedule:true});
  await new CloudStorage(f.db).stage([inFlight]);
  const result=await remove(f,a,{userId:b.id});assert.equal(result.status,200,JSON.stringify(result.data));
  assert.equal(count(f,'users','WHERE id=?',a.id),0);
  assert.equal(count(f,'sessions','WHERE user_id=?',a.id),0);
  assert.equal(count(f,'records','WHERE user_id=?',a.id),0);
  assert.equal(count(f,'shares','WHERE id=?',shareId),0);
  assert.equal(count(f,'deliveries','WHERE sender_id=? OR recipient_id=?',a.id,a.id),0);
  assert.equal(count(f,'connections','WHERE requester_id=? OR recipient_id=?',a.id,a.id),0);
  assert.equal(count(f,'blocks','WHERE user_id=? OR blocked_id=?',a.id,a.id),0);
  assert.equal(count(f,'cloud_repack'),0);
  assert.equal(count(f,'cloud_share_repair'),0);
  assert.equal(count(f,'attempts','WHERE key IN (?,?,?)','delete:'+a.id,'password:'+a.id,'login:'+a.username),0);
  assert.equal(count(f,'rate_limits','WHERE key=?','search:'+a.id),0);
  assert.deepEqual(f.sql.prepare("SELECT user_id,name,payload FROM records WHERE user_id<>? AND name LIKE 'p:%' ORDER BY user_id,name").all(a.id),others);
  assert.deepEqual(f.sql.prepare('SELECT id,storage_bytes FROM users WHERE id<>? ORDER BY id').all(a.id),quotas);
  assert.equal(count(f,'cloud_objects','WHERE id=?',privateRef.slice(5)),0);
  assert.equal(count(f,'cloud_chunks','WHERE object_id=?',privateRef.slice(5)),0);
  assert.equal(count(f,'cloud_edges','WHERE parent_id=?',privateRef.slice(5)),0);
  assert.equal(count(f,'cloud_objects','WHERE id=?',sharedRef.slice(5)),1);
  for(const id of inFlight.objects.keys())assert.equal(count(f,'cloud_objects','WHERE id=?',id),1);
  assert.equal((await f.call(a,'/revision')).status,401);
  assert.equal((await f.call(null,'/shares/'+shareId)).status,404);
  assert.deepEqual((await f.call(null,'/shares/'+kept.code.slice(5))).data.people,{Retained:retained});
  assert.equal((await read(f,b)).status,200);
  assert.deepEqual((await read(f,b)).data.changes.find(r=>r.name==='p:Personal').value,common);
  const delta=(await f.call(b,'/sync?since='+previousRevision)).data;
  assert.equal(delta.changes.find(r=>r.name==='f:'+a.id).value,null,'peers receive a deletion');
  assert.ok((await f.call(b,'/connections')).data.connections.some(r=>r.username===c.username));
  assert.equal(f.sql.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{f.sql.close();}
});
test('deletion requires a current session, matching username and password, with failed-attempt throttling',async()=>{
 const f=fixture();try{
  const a=await seed(f,'secure_delete'),b=await seed(f,'untouched_delete');await f.update(a,'Personal',person('Private'));
  assert.equal((await f.call(null,'/auth/delete',{currentPassword:password,confirmUsername:a.username})).status,401);
  assert.equal((await remove(f,a,{confirmUsername:b.username})).status,400);
  assert.equal((await remove(f,a,{currentPassword:''})).status,400);
  for(let i=0;i<5;i++)assert.equal((await remove(f,a,{currentPassword:'incorrect'})).status,401);
  assert.equal((await remove(f,a)).status,429);
  assert.equal(count(f,'users'),2);assert.equal((await read(f,a)).status,200);assert.equal((await read(f,b)).status,200);
 }finally{f.sql.close();}
});
test('cleanup failure rolls the entire account deletion back',async()=>{
 const f=fixture();try{
  const a=await seed(f,'rollback_delete');await f.update(a,'Personal',person('Private'));
  const share=await f.call(a,'/shares',{people:{Private:person('Private')}});assert.equal(share.status,201);
  f.sql.exec("CREATE TRIGGER simulate_delete_failure AFTER DELETE ON shares BEGIN SELECT RAISE(ABORT,'test rollback'); END;");
  assert.equal((await remove(f,a)).status,503);
  assert.equal(count(f,'users','WHERE id=?',a.id),1);assert.equal(count(f,'sessions','WHERE user_id=?',a.id),1);
  assert.ok(count(f,'records','WHERE user_id=?',a.id)>0);assert.equal(count(f,'shares','WHERE owner_id=?',a.id),1);
  assert.equal((await read(f,a)).status,200);
 }finally{f.sql.close();}
});
test('recently staged objects are reclaimed after the safety lease, while other account references survive',async()=>{
 const f=fixture();try{
  const a=await seed(f,'leased_delete'),b=await seed(f,'leased_keep');
  await f.update(a,'Personal',person('Private'));await f.update(b,'Personal',person('Keep'));
  const ref=f.sql.prepare("SELECT payload FROM records WHERE user_id=? AND name='p:Personal'").get(a.id).payload;
  assert.equal((await remove(f,a)).status,200);
  assert.equal(count(f,'cloud_objects','WHERE id=?',ref.slice(5)),1,'active safety lease protects concurrent staging');
  await new CloudStorage(f.db).collect(Date.now()+86400001);
  assert.equal(count(f,'cloud_objects','WHERE id=?',ref.slice(5)),0);
  assert.deepEqual((await read(f,b)).data.changes.find(r=>r.name==='p:Personal').value,person('Keep'));
 }finally{f.sql.close();}
});
test('credentials revoked during password verification cannot delete the account',async()=>{
 const f=fixture();try{
  const a=await seed(f,'race_delete');await f.update(a,'Personal',person('Private'));
  const prepare=f.db.prepare.bind(f.db);
  f.db.prepare=query=>{
   const statement=prepare(query);
   if(query.startsWith('DELETE FROM users WHERE id=? AND password_hash=?')){
    const first=statement.first;
    statement.first=async()=>{f.sql.prepare('UPDATE users SET password_hash=? WHERE id=?').run('changed concurrently',a.id);return first();};
   }
   return statement;
  };
  assert.equal((await remove(f,a)).status,409);
  assert.equal(count(f,'users','WHERE id=?',a.id),1);assert.ok(count(f,'records','WHERE user_id=?',a.id)>0);
 }finally{f.sql.close();}
});
test('a deferred storage cleanup does not report failure after the account is already deleted',async()=>{
 const f=fixture();try{
  const a=await seed(f,'deferred_delete');await f.update(a,'Personal',person('Private'));
  const prepare=f.db.prepare.bind(f.db);
  f.db.prepare=query=>{
   const statement=prepare(query);
   if(query.includes('WITH RECURSIVE roots(id)')) statement.run=async()=>{throw Error('free tier daily row read limit');};
   return statement;
  };
  assert.equal((await remove(f,a)).status,200);
  assert.equal(count(f,'users','WHERE id=?',a.id),0);
  assert.equal(count(f,'records','WHERE user_id=?',a.id),0);
 }finally{f.sql.close();}
});
