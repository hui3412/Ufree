import {test} from "node:test";
import assert from "node:assert/strict";
import {fixture} from "./helpers/cloud-db.mjs";
test("nonempty passwords accept one character, digits and more than 128 characters",async()=>{
 const f=fixture();try{
 for(const [index,password] of ["a","1","x".repeat(256)].entries()){
  const username="flexible_"+index;
  const signup=await f.call(null,"/auth/signup",{username,password,school:"marianopolis",personalSchedule:"Own",people:{Own:{semester:"Fall 2026",classes:[]}},consent:true});
  assert.equal(signup.status,201,JSON.stringify(signup.data));
  assert.equal((await f.call(null,"/auth/login",{username,password})).status,200);
 }
 assert.equal((await f.call(null,"/auth/signup",{username:"empty_password",password:""})).status,400);
 }finally{f.sql.close();}
});
