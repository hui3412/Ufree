import {test} from 'node:test';
import assert from 'node:assert/strict';
import {app} from './helpers/online-ui.mjs';
const person={semester:'Fall 2026',source_file:'original.png',classes:[{course:'Calculus',day:'Monday',start:'09:00',end:'10:00',room:'A-1',instructor:'Full Teacher',custom:'Preserve'}]};
const local={data:{people:{Original:person,Bob:{...person,source_file:'bob.png'}}},meta:{filename:'Local'}};
const button=(w,label)=>[...w.document.querySelectorAll('button')].find(x=>x.textContent===label || w.UFreeI18n?.sourceText(x)===label);
const pause=()=>new Promise(r=>setTimeout(r,30));
const field=(w,label)=>[...w.document.querySelectorAll('.account-dialog label')].find(x=>x.firstChild?.textContent===label)?.querySelector('input,select');
const open=(a)=>{a.el('mobileMenuButton').click();a.el('accountMenuButton').click();};
test('Local and Online tabs are visible; signed-out Local data stays byte-for-byte and Online prompts sign-in',async()=>{
 const a=await app({localRecord:local});try{
 assert.ok(a.el('localSchedulesTab'));assert.ok(a.el('onlineSchedulesTab'));assert.match(a.el('peopleList').textContent,/Original/);
 a.el('onlineSchedulesTab').click();assert.match(a.w.document.querySelector('.account-dialog').textContent,/Sign in/);
 assert.equal(a.calls.length,0);assert.equal(a.w.localStorage.getItem('whos-free-local-schedules'),a.original);
 a.w.UFreeI18n.setLanguage('fr');assert.match(a.el('onlineSchedulesTab').textContent,/Horaires en ligne/);
 }finally{await a.close();}
});
test('Online includes only attached own and followed schedules, supports cloud nicknames and disables edits to list rows',async()=>{
 const a=await app({account:true,localRecord:local,extraRecords:{'p:Personal':person,'p:UnrelatedLocalFriend':person,'@profile':{nickname:'My nickname'},'f:other-id':{username:'real_bob',nickname:'Bob nick',person}}});try{
 const data=a.w.UFreeAccounts.read().data.people;
 assert.deepEqual(Object.keys(data),['@fictional_user','@real_bob']);assert.equal(a.w.UFreeAccounts.isLive('@real_bob'),true);assert.equal(a.w.UFreeAccounts.isLive('@fictional_user'),true);
 assert.equal(a.w.UFreeAccounts.nickname('@real_bob'),'Bob nick');
 assert.throws(()=>a.w.UFreeAccounts.save({data:{people:{New:person}}}),/read-only/);
 assert.throws(()=>a.w.UFreeAccounts.clear(),/attached to accounts/);
 assert.doesNotMatch(a.el('peopleList').textContent,/Original|UnrelatedLocalFriend/);
 assert.equal(a.w.localStorage.getItem('whos-free-local-schedules'),a.original);
 const before=a.calls.length;a.el('timeInput').value='09:30';a.el('timeInput').dispatchEvent(new a.w.Event('input'));await pause();assert.equal(a.calls.length,before);
 open(a);const text=a.w.document.querySelector('.account-dialog').textContent;assert.doesNotMatch(text,/Copy Local to Account|Cloud sharing/);assert.ok(button(a.w,'Edit profile'));assert.ok(button(a.w,'Followers'));
 }finally{await a.close();}
});
test('profile blocks incomplete classes, saves nickname plus one full attached schedule and preserves Local data',async()=>{
 const a=await app({account:true,localRecord:local,extraRecords:{'p:Personal':person},handler:(path)=>path==='/sync'?{revision:2}:undefined});try{
 open(a);button(a.w,'Edit profile').click();
 const course=a.w.document.querySelector('[data-profile-field="course"]');course.value='';button(a.w,'Save profile').click();await pause();assert.equal(a.calls.filter(c=>c.url.endsWith('/sync')).length,0);
 course.value='New course';const end=a.w.document.querySelector('[data-profile-field="end"]');end.value='08:00';button(a.w,'Save profile').click();await pause();assert.equal(a.calls.filter(c=>c.url.endsWith('/sync')).length,0);
 end.value='10:20';field(a.w,'Account nickname').value='Tom';button(a.w,'Save profile').click();await pause();
 const sent=a.calls.find(c=>c.url.endsWith('/sync'));assert.ok(sent);const body=JSON.parse(sent.options.body);assert.deepEqual(body.changes.map(x=>x.name).sort(),['@profile','p:Personal']);assert.equal(body.changes.find(x=>x.name==='@profile').value.nickname,'Tom');assert.equal(body.changes.find(x=>x.name==='p:Personal').value.classes[0].custom,'Preserve');
 assert.equal(a.w.localStorage.getItem('whos-free-local-schedules'),a.original);
 a.w.UFreeI18n.setLanguage('fr');assert.match(a.w.document.querySelector('.account-dialog').textContent,/Modifier le profil/);
 }finally{await a.close();}
});
test('signup sends only the selected own schedule, never the rest of Local',async()=>{
 const a=await app({localRecord:local,handler:(path)=>path==='/auth/signup'?new Response(JSON.stringify({error:'stop after request capture'}),{status:400}):undefined});try{
 open(a);button(a.w,'Create account').click();field(a.w,'Username').value='new_owner';field(a.w,'Password').value='test-password-123';a.el("schoolChooser").open=true;a.w.document.querySelector('[data-school-id="marianopolis"]').click();field(a.w,'Account nickname').value='Nickname';
 const consent=a.w.document.querySelector('.account-dialog input[type="checkbox"]');consent.checked=true;
 button(a.w,'Create account').click();await pause();const sent=a.calls.find(c=>c.url.endsWith('/auth/signup'));assert.ok(sent);const body=JSON.parse(sent.options.body);assert.deepEqual(body.people,{Personal:person});assert.equal(body.school,'marianopolis');assert.equal(body.nickname,'Nickname');assert.equal(body.personalSchedule,'Personal');assert.equal(a.w.localStorage.getItem('whos-free-local-schedules'),a.original);
 }finally{await a.close();}
});
test('offline profile changes remain queued and a followed row can never be uploaded by a client edit',async()=>{
 const a=await app({account:true,localRecord:local,extraRecords:{'p:Personal':person},handler:(path)=>path==='/sync'?Promise.reject(Error('offline')):undefined});try{
 open(a);button(a.w,'Edit profile').click();field(a.w,'Account nickname').value='Offline nick';button(a.w,'Save profile').click();await pause();
 const cached=JSON.parse(a.w.localStorage.getItem('ufree-test-account-v1:test-user'));assert.equal(cached.records['@profile'].nickname,'Offline nick');assert.notDeepEqual(cached.records,cached.base);assert.equal(a.w.localStorage.getItem('whos-free-local-schedules'),a.original);
 }finally{await a.close();}
});
test('a concurrent personal edit shows its preserved draft and allows review instead of reporting a completed upload',async()=>{
 let revision=1,conflict=false;
 const remote={...person,classes:[{...person.classes[0],course:'Remote course'}]};
 const a=await app({account:true,extraRecords:{'p:Personal':person},handler:(path,options)=>{
  if(path==='/revision')return {revision,inboxRevision:0};
  if(path==='/sync' && options?.method==='GET')return {revision,changes:[{name:'p:Personal',value:remote}],personalSchedule:'Personal'};
  if(path==='/sync' && options?.method==='POST'){if(!conflict){conflict=true;revision=2;return new Response(JSON.stringify({error:'Cloud changed. Reconcile and retry.'}),{status:409});}return {revision:++revision};}
 }});
 try{
 await pause();open(a);button(a.w,'Edit profile').click();a.w.document.querySelector('[data-profile-field="course"]').value='Local course';button(a.w,'Save profile').click();await pause();
 assert.match(a.w.document.querySelector('.account-dialog').textContent,/Conflicting edits were preserved as local drafts/);
 const cached=JSON.parse(a.w.localStorage.getItem('ufree-test-account-v1:test-user'));assert.equal(cached.records['p:Personal'].classes[0].course,'Remote course');assert.equal(cached.records['draft:Personal (sync conflict 1)'].classes[0].course,'Local course');
 button(a.w,'Review saved conflict draft').click();assert.equal(a.w.document.querySelector('[data-profile-field="course"]').value,'Local course');
 }finally{await a.close();}
});
