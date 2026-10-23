import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scryptAsync} from '@noble/hashes/scrypt';
import {bytesToHex,hexToBytes} from '@noble/hashes/utils';
import {passwordHash} from '../backend/worker.mjs';
import {fixture} from './helpers/cloud-db.mjs';
const salt='00112233445566778899aabbccddeeff'.repeat(2);
for(const password of ['fictional-password-123','Fictionnel-école-猫-123']){
 test('native password hashes match existing stored scrypt hashes: '+(password.startsWith('fictional')?'ASCII':'Unicode'),async()=>{
  const old=await scryptAsync(password,hexToBytes(salt),{N:32768,r:8,p:3,dkLen:32,maxmem:64*1024*1024});
  const stored=`scrypt$32768$8$3$${salt}$${bytesToHex(old)}`;
  assert.equal(await passwordHash(password,salt),stored);
  const f=fixture();try{
   const user=await f.seed('native_legacy');f.sql.prepare('UPDATE users SET password_hash=? WHERE id=?').run(stored,user.id);
   assert.equal((await f.call(null,'/auth/login',{username:user.username,password})).status,200);
   assert.equal((await f.call(null,'/auth/login',{username:user.username,password:password+'wrong'})).status,401);
  }finally{f.sql.close();}
 });
}
test('new native hashes use distinct random salts',async()=>{
 const [a,b]=await Promise.all([passwordHash('fictional-password-123'),passwordHash('fictional-password-123')]);
 assert.match(a,/^scrypt\$32768\$8\$3\$[a-f0-9]{64}\$[a-f0-9]{64}$/);assert.notEqual(a,b);
});
