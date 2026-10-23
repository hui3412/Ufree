import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {fixture} from './helpers/cloud-db.mjs';
const DAY=86400000,HOUR=3600000;
test('new sign-ins last three days and regular authenticated use renews without rewriting every request',async()=>{
 const f=fixture();try{
 const result=await f.call(null,'/auth/signup',{username:'session_new',password:'fictional-session-password',school:'marianopolis',personalSchedule:'Personal',people:{Personal:{classes:[]}},consent:true});
 assert.equal(result.status,201);const user=result.data;
 let row=f.sql.prepare('SELECT * FROM sessions WHERE user_id=?').get(user.user.id);assert.equal(row.expires_at-row.created_at,3*DAY);assert.equal(user.expiresAt,row.expires_at);
 const now=Date.now();f.sql.prepare('UPDATE sessions SET created_at=?,expires_at=?,last_refreshed_at=? WHERE user_id=?').run(now-DAY,now+2*DAY,now-2*HOUR,user.user.id);
 const actor={token:user.token};assert.equal((await f.call(actor,'/revision')).status,200);
 row=f.sql.prepare('SELECT * FROM sessions WHERE user_id=?').get(user.user.id);assert.ok(row.expires_at>=now+3*DAY);assert.ok(row.expires_at<=Date.now()+3*DAY);
 f.db.queries=0;assert.equal((await f.call(actor,'/revision')).status,200);assert.equal(f.db.queries,1,'fresh activity uses only the indexed authentication read');
 }finally{f.sql.close();}
});
test('inactive sessions cannot revive and continuing use cannot extend beyond thirty days from sign-in',async()=>{
 const f=fixture();try{
 const user=await f.seed('session_cap'),now=Date.now(),created=now-29*DAY;
 f.sql.prepare('UPDATE sessions SET created_at=?,expires_at=?,last_refreshed_at=? WHERE user_id=?').run(created,now+HOUR,now-2*HOUR,user.id);
 assert.equal((await f.call(user,'/revision')).status,200);assert.equal(f.sql.prepare('SELECT expires_at FROM sessions WHERE user_id=?').get(user.id).expires_at,created+30*DAY);
 f.sql.prepare('UPDATE sessions SET expires_at=? WHERE user_id=?').run(now-1,user.id);
 assert.equal((await f.call(user,'/revision')).status,401);assert.equal(f.sql.prepare('SELECT expires_at FROM sessions WHERE user_id=?').get(user.id).expires_at,now-1);
 f.sql.prepare('UPDATE sessions SET created_at=?,expires_at=? WHERE user_id=?').run(now-31*DAY,now+DAY,user.id);
 assert.equal((await f.call(user,'/revision')).status,401);
 }finally{f.sql.close();}
});
test('migration keeps existing tokens while shortening idle expiry without extending their original hard deadline',()=>{
 const sql=new DatabaseSync(':memory:');try{
 sql.exec('CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT,expires_at INTEGER);');
 const now=Date.now();sql.prepare('INSERT INTO sessions VALUES(?,?,?)').run('fresh','a',now+30*DAY);sql.prepare('INSERT INTO sessions VALUES(?,?,?)').run('old','b',now+DAY);
 sql.exec(fs.readFileSync(new URL('../backend/migrations/0010_sliding_sessions.sql',import.meta.url),'utf8'));
 const fresh=sql.prepare("SELECT * FROM sessions WHERE token_hash='fresh'").get(),old=sql.prepare("SELECT * FROM sessions WHERE token_hash='old'").get();
 assert.equal(fresh.created_at,now);assert.ok(fresh.expires_at<=now+3*DAY);assert.equal(old.expires_at,now+DAY);assert.equal(old.created_at,now-29*DAY);
 sql.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run('during-deploy','c',now+30*DAY);
 const compatible=sql.prepare("SELECT * FROM sessions WHERE token_hash='during-deploy'").get();assert.ok(compatible.created_at>now-1000);assert.ok(compatible.expires_at<=Date.now()+3*DAY);
 }finally{sql.close();}
});
