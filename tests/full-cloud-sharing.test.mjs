import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './helpers/cloud-db.mjs';
import {CloudStorage} from '../backend/cloud-storage.mjs';
const original={semester:'Fall 2026',source_file:'photo.png',custom:{note:'Saved note'},classes:[{day:'Monday',start:'09:00',end:'10:00',course:'Math',course_code:'201',section:'01',room:'A-1',instructor:'Test Teacher',extra:'Original detail'}]};
const partial={semester:original.semester,classes:[{day:'Monday',start:'09:00',end:'10:00'}]};
test('cloud links and inbox deliveries reuse the complete original object and remain independent snapshots',async()=>{
 const f=fixture();try{
 const a=await f.seed('full_sender'),b=await f.seed('full_receiver');
 await f.update(a,'Personal',original);
 const shared=await f.call(a,'/shares',{people:{Personal:partial}});
 assert.equal(shared.status,201);
 const sent=await f.call(a,'/deliveries',{username:b.username,people:{Personal:partial},confirmed:true});assert.equal(sent.status,201);
 const store=new CloudStorage(f.db),ref=f.sql.prepare("SELECT payload FROM records WHERE user_id=? AND name='p:Personal'").get(a.id).payload;
 const entries=await store.object(f.sql.prepare('SELECT payload FROM shares').get().payload.slice(5),'collection');
 assert.equal(entries[0][1],ref.slice(5));
 assert.equal(f.sql.prepare('SELECT count(*) AS n FROM cloud_objects WHERE personal_id IS NOT NULL').get().n,0);
 assert.deepEqual((await f.call(null,'/shares/'+shared.data.code.slice(5))).data.people,{Personal:original});
 assert.deepEqual((await f.call(b,'/deliveries')).data.deliveries[0].people,{Personal:original});
 await f.update(a,'Personal',{...original,classes:[{...original.classes[0],instructor:'Later teacher'}]});
 assert.deepEqual((await f.call(null,'/shares/'+shared.data.code.slice(5))).data.people,{Personal:original});
 }finally{f.sql.close();}
});
test('repair recovers stripped old snapshots only from the sender and reports missing or incompatible originals',async()=>{
 const f=fixture({through:'0005_schedule_content.sql'});try{
 const a=await f.seed('legacy_full'),b=await f.seed('other_full');
 // Before migration 0006 use the full v2 storage writer, not the new sharing routes.
 const store=new CloudStorage(f.db),prepared=await store.prepare(original,{schedule:true});await store.stage([prepared]);
 f.sql.prepare("INSERT INTO records VALUES(?,?,?,1)").run(a.id,'p:Personal',prepared.ref);
 const insert=f.sql.prepare('INSERT INTO shares(id,owner_id,payload,created_at,expires_at) VALUES(?,?,?,?,?)');
 insert.run('a'.repeat(64),a.id,JSON.stringify({Personal:partial}),100,Date.now()+86400000);
 insert.run('b'.repeat(64),a.id,JSON.stringify({Personal:{...partial,classes:[{...partial.classes[0],course:'Old different course'}]}}),100,Date.now()+86400000);
 insert.run('c'.repeat(64),b.id,JSON.stringify({Personal:partial}),100,Date.now()+86400000);
 f.sql.exec(fs.readFileSync(new URL('../backend/migrations/0006_complete_cloud_shares.sql',import.meta.url),'utf8'));
 await store.repairShares({limit:20});
 const jobs=f.sql.prepare('SELECT row_key,status FROM cloud_share_repair ORDER BY row_key').all();assert.deepEqual(jobs.map(j=>j.status),['recovered','unresolved','unresolved']);
 assert.deepEqual(await store.people(f.sql.prepare('SELECT payload FROM shares WHERE id=?').get('a'.repeat(64)).payload),{Personal:original});
 assert.deepEqual(await store.people(f.sql.prepare('SELECT payload FROM shares WHERE id=?').get('c'.repeat(64)).payload),{Personal:partial});
 assert.equal(await store.repairShares(),0);
 }finally{f.sql.close();}
});
test('migration replaces old filtered live copies with the full source and notifies recipients by revision',async()=>{
 const f=fixture({through:'0005_schedule_content.sql'});try{
 const a=await f.seed('live_full_a'),b=await f.seed('live_full_b');
 for(const user of [a,b]) {const p=await new CloudStorage(f.db).prepare(original,{schedule:true});await new CloudStorage(f.db).stage([p]);f.sql.prepare('INSERT INTO records VALUES(?,?,?,1)').run(user.id,'p:Personal',p.ref);}
 f.sql.prepare("INSERT INTO connections(id,requester_id,recipient_id,pair_key,status,created_at) VALUES(?,?,?,?, 'accepted',?)").run('old-mutual',a.id,b.id,[a.id,b.id].sort().join(':'),Date.now());
 f.sql.prepare("INSERT INTO records VALUES(?,?,?,1)").run(b.id,'f:'+a.id,JSON.stringify({username:a.username,person:partial}));
 // Replace with a deliberately stripped legacy live value.
 f.sql.prepare("UPDATE records SET payload=? WHERE user_id=? AND name=?").run(JSON.stringify({username:a.username,person:partial}),b.id,'f:'+a.id);
 const rev=(await f.call(b,'/revision')).data.revision;
 f.sql.exec(fs.readFileSync(new URL('../backend/migrations/0006_complete_cloud_shares.sql',import.meta.url),'utf8'));
 const delta=await f.call(b,'/sync?since='+rev);assert.equal(delta.status,200);
 assert.deepEqual(delta.data.changes.find(row=>row.name==='f:'+a.id).value.person,original);
 assert.ok(delta.data.revision>rev);
 }finally{f.sql.close();}
});
