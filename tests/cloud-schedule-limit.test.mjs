import {test} from "node:test";
import assert from "node:assert/strict";
import {fixture} from "./helpers/cloud-db.mjs";
const person={semester:"Fall 2026",classes:[]};
test("100 uploaded schedules are enforced atomically; updates, deletion and other accounts still work",async()=>{
 const f=fixture();try{
 const user=await f.seed("limit_owner"),other=await f.seed("limit_other");
 const insert=f.sql.prepare("INSERT INTO records(user_id,name,payload,revision) VALUES(?,?,?,0)");
 for(let i=0;i<100;i++)insert.run(user.id,"p:S"+i,JSON.stringify(person));
 const send=async changes=>f.call(user,"/sync",{baseRevision:await f.revision(user),changes});
 assert.equal((await send([{name:"p:Overflow",value:person}])).status,413);
 assert.throws(()=>insert.run(user.id,"p:Bypass",JSON.stringify(person)),/Cloud schedule limit reached/);
 assert.equal((await send([{name:"p:S0",value:{...person,note:"Edited"}}])).status,200);
 assert.equal((await send([{name:"p:S1",value:null},{name:"p:Replacement",value:person}])).status,200);
 assert.equal((await f.call(user,"/shares",{people:{Overflow:person}})).status,413);
 assert.equal((await f.call(user,"/deliveries",{username:other.username,people:{Overflow:person},confirmed:true})).status,413);
 assert.equal((await f.call(user,"/shares",{people:{Replacement:person}})).status,201);
 assert.equal((await f.update(other,"Own",person)).status,200);
 const oversized=Object.fromEntries(Array.from({length:101},(_,i)=>['Extra'+i,person]));
 assert.equal((await f.call(other,"/shares",{people:oversized})).status,413);
 assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM records WHERE user_id=? AND name GLOB 'p:*' AND payload IS NOT NULL").get(user.id).n,100);
 }finally{f.sql.close();}
});
