import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker,{passwordHash} from '../backend/worker.mjs';
import {fixture} from './helpers/cloud-db.mjs';
test('all password operations dispatch through the private binding and retain the existing scrypt format',async()=>{
 const f=fixture(),calls=[];
 const env={DB:f.db,PASSWORD_CRYPTO:{getByName(scope){assert.match(scope,/^[a-f0-9]{64}$/);return {async derive(password,salt){calls.push({scope,salt});return passwordHash(password,salt);}};}}};
 const call=async(path,data,token)=>{
  const response=await worker.fetch(new Request('https://api.test'+path,{method:'POST',headers:{Origin:'https://hui3412.github.io','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data)}),env);
  return {status:response.status,data:await response.json()};
 };
 try{
 const username='private_crypto',password='fictional-original-123',next='fictional-changed-123';
 const signup=await call('/auth/signup',{username,password,school:'marianopolis',personalSchedule:'Personal',people:{Personal:{classes:[]}},consent:true});assert.equal(signup.status,201);
 assert.equal((await call('/auth/login',{username,password})).status,200);
 const stored=f.sql.prepare('SELECT password_hash FROM users WHERE id=?').get(signup.data.user.id).password_hash;
 assert.match(stored,/^scrypt\$32768\$8\$3\$[a-f0-9]{64}\$[a-f0-9]{64}$/);
 assert.equal((await call('/auth/password',{currentPassword:password,newPassword:next},signup.data.token)).status,200);
 assert.equal((await call('/auth/delete',{currentPassword:next,confirmUsername:username},signup.data.token)).status,200);
 assert.equal(calls.length,5);assert.equal(new Set(calls.map(c=>c.scope)).size,1);
 const config=JSON.parse(fs.readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
 assert.equal(config.main,'backend/entry.mjs');assert.equal(config.limits,undefined);
 assert.deepEqual(config.migrations,[{tag:'password-crypto-v1',new_sqlite_classes:['PasswordCrypto']}]);
 }finally{f.sql.close();}
});
