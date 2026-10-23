import {test} from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../schools.js';
import {app} from './helpers/online-ui.mjs';
import {fixture} from './helpers/cloud-db.mjs';
const button=(w,label)=>[...w.document.querySelectorAll('button')].find(x=>x.textContent===label || w.UFreeI18n?.sourceText(x)===label);
const field=(w,label)=>[...w.document.querySelectorAll('.account-dialog label')].find(x=>x.firstChild?.textContent===label)?.querySelector('input,select');
const pause=()=>new Promise(r=>setTimeout(r,30));
const person={classes:[{course:'Calculus',day:'Monday',start:'09:00',end:'10:00'}]};
const localRecord={data:{people:{Owner:person}}};
async function signup(){const a=await app({localRecord});a.el('mobileMenuButton').click();a.el('accountMenuButton').click();button(a.w,'Create account').click();return a;}
test('catalog supports unaccented names, aliases and regions, and separates campus portals',()=>{
 assert.equal(catalog.search('EDOUARD montpetit')[0].id,'cegepmontpetit');
 assert.equal(catalog.search('cegep ahuntsic')[0].name,'Collège Ahuntsic');
 assert.equal(catalog.search('heritage')[0].id,'cegep-heritage');
 assert.equal(catalog.search('Lanaudiere').length,3);
 assert.equal(catalog.search('Champlain').length,3);
 assert.equal(catalog.search('Lionel Groulx').length,0);
 assert.equal(new Set(catalog.schools.map(x=>x.id)).size,catalog.schools.length);
 assert.equal(catalog.find('__proto__'),undefined);
});
test('expandable search selects an existing school, collapses, reopens and replaces it without losing signup fields',async()=>{
 const a=await signup();try{
 const chooser=a.el('schoolChooser'), search=a.el('cegepSearch');
 assert.equal(chooser.open,false);assert.equal(a.el('selectedCegep').type,'hidden');
 field(a.w,'Username').value='preserve_me';chooser.open=true;
 search.value='EDOUARD';search.dispatchEvent(new a.w.Event('input'));
 assert.equal(a.el('cegepResults').querySelectorAll('button').length,1);
 search.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
 await pause();assert.equal(a.calls.length,0);
 a.w.document.querySelector('[data-school-id="cegepmontpetit"]').click();
 assert.equal(chooser.open,false);assert.equal(a.el('selectedCegep').value,'cegepmontpetit');assert.match(chooser.querySelector('summary').textContent,/Édouard-Montpetit/);
 chooser.open=true;search.value='ahuntsic';button(a.w,'Search').click();
 a.w.document.querySelector('[data-school-id="collegeahuntsic"]').click();
 assert.equal(a.el('selectedCegep').value,'collegeahuntsic');assert.equal(field(a.w,'Username').value,'preserve_me');
 chooser.open=true;search.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal(chooser.open,false);
 }finally{await a.close();}
});
test('typed search text cannot count as selection; missing or forged selection blocks signup',async()=>{
 const a=await signup();try{
 field(a.w,'Username').value='new_owner';field(a.w,'Password').value='fictional-password-123';a.w.document.querySelector('.account-dialog input[type="checkbox"]').checked=true;
 a.el('cegepSearch').value='Ahuntsic';button(a.w,'Create account').click();await pause();
 assert.equal(a.calls.length,0);assert.equal(a.el('schoolChooser').open,true);assert.match(a.w.document.querySelector('.account-dialog').textContent,/Select a CEGEP from the list/);
 a.el('selectedCegep').value='arbitrary-school';button(a.w,'Create account').click();await pause();assert.equal(a.calls.length,0);
 a.el('cegepSearch').value='no such cegep 9876';button(a.w,'Search').click();assert.equal(a.el('cegepResults').children.length,0);
 assert.equal(a.w.document.querySelector('.school-picker-content > p:last-child').hidden,false);
 }finally{await a.close();}
});
test('French chooser translates controls and keeps official institution names intact',async()=>{
 const a=await signup();try{
 a.w.UFreeI18n.setLanguage('fr');assert.match(a.el('schoolChooser').textContent,/Choisissez votre cégep/);assert.match(a.el('schoolChooser').textContent,/Rechercher un cégep/);
 a.w.document.querySelector('[data-school-id="johnabbott"]').click();assert.equal(a.el('schoolChooser').querySelector('summary [data-no-translate]').textContent,'John Abbott College');
 a.w.UFreeI18n.setLanguage('en');assert.equal(a.el('schoolChooser').querySelector('summary [data-no-translate]').textContent,'John Abbott College');
 }finally{await a.close();}
});
test('server rejects arbitrary school values before database use and stores canonical catalog names',async()=>{
 const f=fixture();try{
 const body={username:'school_test',password:'fictional-password-123',school:'collegeahuntsic',personalSchedule:'Personal',people:{Personal:person},consent:true};
 for(const school of [undefined,'','Custom School','Collège Ahuntsic','COLLEGEAHUNTSIC','__proto__',{},null]){
 f.db.queries=0;const result=await f.call(null,'/auth/signup',{...body,school});assert.equal(result.status,400);assert.equal(result.data.error,'Select a CEGEP from the list.');assert.equal(f.db.queries,0);
 }
 const valid=await f.call(null,'/auth/signup',body);assert.equal(valid.status,201);assert.equal(valid.data.user.school,'Collège Ahuntsic');assert.equal(f.sql.prepare('SELECT school FROM users WHERE id=?').get(valid.data.user.id).school,'Collège Ahuntsic');
 const login=await f.call(null,'/auth/login',{username:body.username,password:body.password});assert.equal(login.data.user.school,'Collège Ahuntsic');
 }finally{f.sql.close();}
});
