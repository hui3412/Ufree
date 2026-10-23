import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './helpers/cloud-db.mjs';
import {CloudStorage} from '../backend/cloud-storage.mjs';
const repair=fs.readFileSync(new URL('../backend/migrations/0008_restore_complete_cloud_schema.sql',import.meta.url),'utf8');
const attached=fs.readFileSync(new URL('./fixtures/attached-accounts-schema.sql',import.meta.url),'utf8');
const person=course=>({semester:'Fall 2026',source_file:'original-picture.png',classes:[{course,day:'Monday',start:'09:00',end:'10:00',room:'A-1',instructor:'Full Teacher',custom:'Preserve this too'}]});
test('repair upgrades the actual attached-account schema without losing users, records, objects or active follows',async()=>{
 const f=fixture({through:'0006_complete_cloud_shares.sql'});
 try{
 f.sql.exec(attached);
 const a=await f.seed('restore_alice'),b=await f.seed('restore_bob');
 const original=person('Calculus'),storage=new CloudStorage(f.db);
 const prepared=await storage.prepare(original,{schedule:true});await storage.stage([prepared]);
 for(const user of [a,b])f.sql.prepare('INSERT INTO records(user_id,name,payload,revision) VALUES(?,?,?,1)').run(user.id,'p:Personal',prepared.ref);
 f.sql.prepare("UPDATE users SET nickname='Keep nickname'").run();
 f.sql.prepare("INSERT INTO connections(id,requester_id,recipient_id,pair_key,status,created_at) VALUES(?,?,?,?,?,?)").run('preexisting-follow',a.id,b.id,[a.id,b.id].sort().join(':'),'pending',Date.now());
 f.sql.prepare("UPDATE connections SET status='accepted' WHERE id='preexisting-follow'").run();
 const before=f.sql.prepare('SELECT id,username,password_hash,nickname FROM users ORDER BY id').all();
 const objects=f.sql.prepare('SELECT id FROM cloud_objects ORDER BY id').all();
 f.sql.exec(repair);
 assert.deepEqual(f.sql.prepare('SELECT id,username,password_hash,nickname FROM users ORDER BY id').all(),before);
 assert.deepEqual(f.sql.prepare('SELECT id FROM cloud_objects ORDER BY id').all(),objects);
 assert.equal(f.sql.prepare("SELECT payload FROM records WHERE user_id=? AND name='p:Personal'").get(a.id).payload,prepared.ref);
 const delta=await f.call(b,'/sync?since=0');assert.equal(delta.status,200);assert.deepEqual(delta.data.changes.find(x=>x.name==='f:'+a.id).value.person,original);
 const people={Saved:original};const share=await f.call(a,'/shares',{people});assert.equal(share.status,201);
 assert.deepEqual((await f.call(null,'/shares/'+share.data.code.slice(5))).data.people,people);
 const delivery=await f.call(a,'/deliveries',{username:b.username,people,confirmed:true});assert.equal(delivery.status,201);
 const inbox=(await f.call(b,'/deliveries')).data;assert.deepEqual(inbox.deliveries[0].people,people);
 const changed=person('Edited course');assert.equal((await f.update(a,'Personal',changed)).status,200);
 assert.deepEqual((await f.call(b,'/sync?since=0')).data.changes.find(x=>x.name==='f:'+a.id).value.person,changed);
 assert.deepEqual((await f.call(null,'/shares/'+share.data.code.slice(5))).data.people,people);
 assert.equal((await f.call(b,'/deliveries/respond',{id:inbox.deliveries[0].id,decision:'declined'})).status,200);
 await storage.repairShares();await storage.collect();
 // Re-running a partially applied repair remains safe and does not drop shares or inbox data.
 f.sql.exec(repair);assert.equal((await f.call(null,'/shares/'+share.data.code.slice(5))).status,200);
 }finally{f.sql.close();}
});
test('fresh databases and existing version-0006 shares survive the compatibility migration',async()=>{
 const f=fixture({through:'0006_complete_cloud_shares.sql'});
 try{
 const a=await f.seed('fresh_restore');const people={Original:person('Original')};const share=await f.call(a,'/shares',{people});assert.equal(share.status,201);
 f.sql.exec(repair);f.sql.exec(repair);
 assert.deepEqual((await f.call(null,'/shares/'+share.data.code.slice(5))).data.people,people);
 const signup=await f.call(null,'/auth/signup',{username:'new_after_repair',password:'fictional-password-123',school:'marianopolis',personalSchedule:'Personal',people:{Personal:person('New account')},consent:true});assert.equal(signup.status,201);
 assert.equal((await f.call(null,'/auth/login',{username:'new_after_repair',password:'fictional-password-123'})).status,200);
 assert.equal(f.sql.prepare('PRAGMA foreign_key_check').all().length,0);
 }finally{f.sql.close();}
});
