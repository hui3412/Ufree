import {test} from "node:test";
import assert from "node:assert/strict";
import {fixture} from "./helpers/cloud-db.mjs";
test("blocked list is authenticated, owner-only, username-only and reflects unblock",async()=>{
 const f=fixture();try{
 const owner=await f.seed("owner"),peer=await f.seed("David"),other=await f.seed("other");
 assert.equal((await f.call(null,"/blocks")).status,401);
 assert.equal((await f.call(owner,"/blocks",{username:"dAvId",blocked:true})).status,200);
 assert.deepEqual((await f.call(owner,"/blocks")).data.users,[{username:"David"}]);
 assert.deepEqual((await f.call(other,"/blocks")).data.users,[]);
 assert.deepEqual((await f.call(peer,"/blocks")).data.users,[]);
 await f.call(owner,"/blocks",{username:"DAVID",blocked:false});
 assert.deepEqual((await f.call(owner,"/blocks")).data.users,[]);
 }finally{f.sql.close();}
});
