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
test('backfill compare-and-swap preserves simultaneous edits and deletions',async()=>{
 const f=fixture();try{
 const a=await f.seed('race_owner');await f.update(a,'Personal',original);
 f.sql.prepare("INSERT INTO cloud_repack VALUES('records',?,'p:Personal')").run(a.id);
 const store=new CloudStorage(f.db),stage=store.stage.bind(store);
 store.stage=async prepared=>{await stage(prepared);f.sql.prepare("UPDATE records SET payload=NULL,revision=2 WHERE user_id=? AND name='p:Personal'").run(a.id);};
 await store.repack();
 assert.equal(f.sql.prepare("SELECT payload FROM records WHERE user_id=? AND name='p:Personal'").get(a.id).payload,null);
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
