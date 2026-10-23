import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import catalog from '../schools.js';
import {fixture} from './helpers/cloud-db.mjs';
test('catalog includes public and private Omnivox colleges and supports accents, aliases and campuses',()=>{
 assert.equal(catalog.schools.length,83);
 for(const [query,id] of [['EDOUARD montpetit','cegepmontpetit'],['Marinopolis','marianopolis'],['Collège Marianopolis','marianopolis'],['brebeuf','brebeuf'],['LaSalle College','collegelasalle'],['TAV','tav']])assert.equal(catalog.search(query)[0]?.id,id);
 assert.equal(catalog.search('Lanaudiere').length,3);assert.equal(catalog.search('Champlain').length,3);
 assert.equal(catalog.find('__proto__'),undefined);assert.equal(catalog.find({}),undefined);
 assert.equal(new Set(catalog.schools.map(s=>s.id)).size,catalog.schools.length);
 const sources=JSON.parse(fs.readFileSync(new URL('../data/cegep-sources.json',import.meta.url)));
 assert.deepEqual(sources.schools.map(s=>s.id),catalog.schools.map(s=>s.id));
 for(const row of sources.schools){assert.ok(new URL(row.source).protocol==='https:');assert.ok(new URL(row.portal).hostname.endsWith('.omnivox.ca'));}
});
test('signup rejects missing, typed or forged colleges before querying the database and stores the selected canonical name',async()=>{
 const f=fixture();try{
 const body={username:'school_test',password:'fictional-password-123',school:'marianopolis',personalSchedule:'Personal',people:{Personal:{classes:[]}},consent:true};
 for(const school of [undefined,'','Custom School','Marianopolis College','MARIANOPOLIS','__proto__',{},null]){
 f.db.queries=0;const result=await f.call(null,'/auth/signup',{...body,school});assert.equal(result.status,400);assert.equal(result.data.error,'Select a CEGEP or college from the list.');assert.equal(f.db.queries,0);
 }
 const valid=await f.call(null,'/auth/signup',body);assert.equal(valid.status,201);assert.equal(valid.data.user.school,'Marianopolis College');assert.equal(f.sql.prepare('SELECT school FROM users WHERE id=?').get(valid.data.user.id).school,'Marianopolis College');
 const login=await f.call(null,'/auth/login',{username:body.username,password:body.password});assert.equal(login.status,200);assert.equal(login.data.user.school,'Marianopolis College');
 }finally{f.sql.close();}
});
test('school catalog is cached offline and loaded before account controls',()=>{
 const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const sw=fs.readFileSync(new URL('../service-worker.js',import.meta.url),'utf8');
 assert.ok(index.indexOf('schools.js?v=1')<index.indexOf('accounts.js?v=151'));assert.match(sw,/schools\.js\?v=1/);
});
