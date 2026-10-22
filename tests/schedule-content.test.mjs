import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {CloudStorage, encodeObject, canonical} from '../backend/cloud-storage.mjs';
import {fixture} from './helpers/cloud-db.mjs';
const original = {semester:'Fall 2026',source_file:'camera.png',ocr:{method:'picture'}, classes:[
 {day:'Tuesday', start:'09:00',end:'10:00',course:'Math',room:'A-1',instructor:'Test Teacher',course_code:'201',section:'1'},
 {day:'Monday',start:'11:00',end:'12:00',course:'Physics',room:'B-2',instructor:'Other Teacher',kind:'lecture'},
]};
async function core(f,user,name) {
 const ref=f.sql.prepare('SELECT payload FROM records WHERE user_id=? AND name=?').get(user.id,'p:'+name).payload;
 const envelope=await new CloudStorage(f.db).object(ref.slice(5));
 assert.equal(envelope[0],'ufree-schedule-v2');
 return envelope[1];
}
test('Tom and Thomas share timetable storage across real screenshot/code imports; exact private data stays independent',async()=>{
 const f=fixture();try{
  const a=await f.seed('tom_owner'),b=await f.seed('thomas_owner');
  const ctx=vm.createContext({TextEncoder,TextDecoder,Blob,CompressionStream,DecompressionStream,Uint8Array});
  vm.runInContext(fs.readFileSync(new URL('../schedule-share-code.js',import.meta.url),'utf8'),ctx);
  const incoming=JSON.parse(JSON.stringify(await ctx.WhosFreeShareCode.decode(await ctx.WhosFreeShareCode.encode({people:{Thomas:original}})))).people.Thomas;
  assert.notDeepEqual(incoming,original);
  assert.equal((await f.update(a,'Tom',original)).status,200);
  assert.equal((await f.update(b,'Thomas',incoming)).status,200);
  assert.equal(await core(f,a,'Tom'), await core(f,b,'Thomas'));
  assert.deepEqual((await f.call(a,'/sync?since=0')).data.changes.find(x=>x.name==='p:Tom').value,original);
  assert.deepEqual((await f.call(b,'/sync?since=0')).data.changes.find(x=>x.name==='p:Thomas').value,incoming);
  const reversed={...incoming,classes:[...incoming.classes].reverse()};
  await f.update(b,'Thomas',reversed);
  assert.equal(await core(f,a,'Tom'),await core(f,b,'Thomas'));
  assert.deepEqual((await f.call(b,'/sync?since=0')).data.changes.find(x=>x.name==='p:Thomas').value,reversed);
  const share=await f.call(a,'/shares',{people:{Tom:original}});
  assert.equal(share.status,201);
  const root=await new CloudStorage(f.db).object(f.sql.prepare('SELECT payload FROM shares').get().payload.slice(5),'collection');
  const shared=await new CloudStorage(f.db).object(root[0][1]);
  assert.equal(shared[1],await core(f,b,'Thomas'));
  assert.deepEqual((await f.call(null,'/shares/'+share.data.code.slice(5))).data.people,{Tom:original});
  await f.update(b,'Thomas',{...incoming,classes:incoming.classes.map((c,i)=>i?c:{...c,end:'10:20'})});
  assert.notEqual(await core(f,a,'Tom'),await core(f,b,'Thomas'));
 }finally{f.sql.close();}
});
test('backfill converts raw and already-compressed accounts, snapshots and deliveries without changing values or revisions',async()=>{
 const f=fixture({through:'0004_usage_efficiency.sql'});try{
 const a=await f.seed('old_a'),b=await f.seed('old_b');
 const store=new CloudStorage(f.db);
 // Stage v1 manually, before the logical_bytes column exists.
 const old=await encodeObject(original);
 f.sql.prepare('INSERT INTO cloud_objects(id,kind,codec,raw_bytes,stored_bytes,data,last_used) VALUES(?,?,?,?,?,?,?)').run(old.id,old.kind,old.codec,old.rawBytes,old.data.length,old.data,0);
 f.sql.prepare('INSERT INTO records(user_id,name,payload,revision) VALUES(?,?,?,?)').run(a.id,'p:Tom','@UF1:'+old.id,3);
 f.sql.prepare('INSERT INTO records(user_id,name,payload,revision) VALUES(?,?,?,?)').run(b.id,'p:Thomas',JSON.stringify({...original,source_file:'Shared code'}),4);
 f.sql.exec('UPDATE users SET revision=5');
 f.sql.prepare('INSERT INTO shares(id,owner_id,payload,created_at,expires_at) VALUES(?,?,?,?,?)').run('a'.repeat(64),a.id,JSON.stringify({Tom:original}),Date.now(),Date.now()+86400000);
 f.sql.prepare("INSERT INTO deliveries(id,sender_id,sender_name,recipient_id,payload,created_at,status) VALUES(?,?,?, ?,?,?,'pending')").run('test-delivery',a.id,a.username,b.id,JSON.stringify({Thomas:original}),Date.now());
 f.sql.exec(fs.readFileSync(new URL('../backend/migrations/0005_schedule_content.sql',import.meta.url),'utf8'));
 let total=0;
 for(let i=0;i<5;i++){const n=await store.repack({limit:1});total+=n;if(!n)break;}
 assert.equal(total,4);
 assert.equal(f.sql.prepare('SELECT count(*) AS n FROM cloud_repack').get().n,0);
 assert.equal(await core(f,a,'Tom'),await core(f,b,'Thomas'));
 assert.deepEqual((await f.call(a,'/sync?since=0')).data.changes[0].value,original);
 assert.equal((await f.call(a,'/revision')).data.revision,5);
 assert.equal((await f.call(b,'/revision')).data.revision,5);
 assert.deepEqual(await store.people(f.sql.prepare('SELECT payload FROM shares').get().payload),{Tom:original});
 assert.deepEqual(await store.people(f.sql.prepare('SELECT payload FROM deliveries').get().payload),{Thomas:original});
 assert.equal(f.sql.prepare('SELECT storage_bytes FROM users WHERE id=?').get(a.id).storage_bytes,Buffer.byteLength(canonical(original)));
 }finally{f.sql.close();}
});
test('backfill compare-and-swap preserves simultaneous edits and deletions',async()=>{
 const f=fixture();try{
 const a=await f.seed('race_owner');await f.update(a,'Tom',original);
 f.sql.prepare("INSERT INTO cloud_repack VALUES('records',?,'p:Tom')").run(a.id);
 const store=new CloudStorage(f.db),stage=store.stage.bind(store);
 store.stage=async prepared=>{await stage(prepared);f.sql.prepare("UPDATE records SET payload=NULL,revision=2 WHERE user_id=? AND name='p:Tom'").run(a.id);};
 await store.repack();
 assert.equal(f.sql.prepare("SELECT payload FROM records WHERE user_id=? AND name='p:Tom'").get(a.id).payload,null);
 assert.equal(await store.repack(),0);
 }finally{f.sql.close();}
});
test('manual compaction requires a separate admin secret and enforces bounded work',async()=>{
 const {default:worker}=await import('../backend/worker.mjs');
 const f=fixture();try{
 const user=await f.seed('non_admin');
 const secret='fictional-maintenance-secret-for-local-tests';
 const call=(token,input={limit:1},enabled=true)=>worker.fetch(new Request('https://api.test/admin/compact',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(input)}),{DB:f.db,...(enabled?{ADMIN_DIAGNOSTICS_TOKEN:secret}:{})});
 f.db.queries=0;
 assert.equal((await call()).status,401);
 assert.equal((await call(user.token)).status,401);
 assert.equal((await call(secret,{},false)).status,503);
 assert.equal((await call(secret,{limit:21})).status,400);
 assert.equal(f.db.queries,0);
 const response=await call(secret);
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{completed:0,pending:0});
 }finally{f.sql.close();}
});
