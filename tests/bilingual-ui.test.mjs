import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Window} from 'happy-dom';
const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const DB='whos-free-local-schedules', LANG='ufree-language-v1';
const person={semester:'Fall 2026',classes:[{day:'Monday',start:'09:00',end:'10:00',course:'Settings',room:'Monday',instructor:'Free',course_code:'201-NYA-05',section:'00001'}]};
const collection={people:{Settings:person,Monday:{semester:'Fall 2026',classes:[]}}};
const plain=x=>JSON.parse(JSON.stringify(x));
const tick=()=>new Promise(r=>setTimeout(r,20));
async function app({language='en',data=collection,groups=[],blocked=false,ocr}={}){
 const w=new Window({url:'https://youfree.ca/',settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}});
 w.document.write(read('index.html'));w.setInterval=()=>0;w.matchMedia=()=>({matches:true,addEventListener(){}});w.confirm=()=>true;
 Object.assign(w,{TextEncoder,TextDecoder,Response,Blob,CompressionStream,DecompressionStream});
 if(data)w.localStorage.setItem(DB,JSON.stringify({data,meta:{}}));
 w.localStorage.setItem(LANG,language);
 if(groups.length)w.localStorage.setItem('whos-free-groups-v1',JSON.stringify({groups,showGroups:true}));
 let copied;
 Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async text=>{copied=text;}}});
 w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};
 w.WhosFreeImageParser={parseScheduleImage:async()=>ocr||({name:'Alice',person:plain(person)})};
 if(blocked)Object.defineProperty(w.localStorage,'setItem',{value:()=>{throw Error('blocked');},configurable:true});
 for(const name of ['i18n-fr.js','i18n.js','schedule-availability.js','schedule-groups.js','schedule-share-code.js','assets/qr/qrcodegen.js','schedule-qr-batches.js','app.js'])w.eval(read(name));
 const el=id=>w.document.getElementById(id);const wait=async pred=>{for(let i=0;i<300;i++){if(pred())return;await tick();}throw Error('Bilingual operation did not finish');};
 await tick();await wait(()=>!el('decodeCodeButton').disabled);
 return{w,el,wait,lang:next=>w.UFreeI18n.setLanguage(next),stored:()=>w.localStorage.getItem(DB),copied:()=>copied,close:()=>w.happyDOM.abort()};
}

test('flag is an obvious image in the shared sidebar and toggles/persists both directions',async()=>{
 const a=await app();try{
 const before=a.stored(),b=a.el('languageToggleButton');
 assert.ok(a.el('homeNavigation').contains(b));assert.match(b.querySelector('img').src,/flag-fr\.svg$/);
 a.el('mobileMenuButton').click();b.click();
 assert.equal(a.w.document.documentElement.lang,'fr');assert.equal(a.el('mobileNavTitle').textContent,'Menu principal');
 assert.equal(a.el('settingsButton').textContent,'Paramètres');assert.match(b.querySelector('img').src,/flag-uk\.svg$/);
 assert.equal(b.querySelector('span').textContent,'English');assert.equal(a.w.localStorage.getItem(LANG),'fr');
 assert.equal(a.el('mobileMenuButton').getAttribute('aria-expanded'),'true');assert.equal(a.stored(),before);
 a.el('closeMobileMenuButton').click();a.el('settingsButton').click();assert.equal(a.el('settingsModal').hidden,false);
 a.lang('en');assert.equal(a.el('settingsButton').textContent,'Settings');assert.equal(a.stored(),before);
 }finally{await a.close();}
});

for(const language of ['en','fr'])test(`startup in ${language} preserves canonical day and semester values`,async()=>{
 const a=await app({language});try{
 assert.equal(a.w.document.documentElement.lang,language);
 const options=[...a.el('daySelect').options];assert.equal(options[0].value,'Monday');assert.equal(options[0].textContent,language==='fr'?'Lundi':'Monday');
 a.el('daySelect').value='Monday';a.el('daySelect').dispatchEvent(new a.w.Event('change'));
 a.el('scheduleDataButton').click();a.el('manualScheduleButton').click();
 assert.equal(a.el('imageReviewSemester').options[1].value,'Winter');
 a.el('imageReviewName').value='My unchanged name';a.el('imageReviewYear').value='2026';a.el('imageReviewSemester').value='Fall';
 a.lang(language==='fr'?'en':'fr');assert.equal(a.el('imageReviewName').value,'My unchanged name');assert.equal(a.el('imageReviewYear').value,'2026');assert.equal(a.el('imageReviewSemester').value,'Fall');
 }finally{await a.close();}
});

test('all static site text and accessible labels have catalogue coverage, including Help, privacy and templates',async()=>{
 const a=await app({data:null});try{
 a.lang('fr');const allowed=new Set(['UFree','UFree?','ufree_info@proton.me','English']);const missing=[];
 const walk=n=>{
 if(n.nodeType===3){const source=a.w.UFreeI18n.sourceText(n.parentNode?.childNodes.length===1 ? n.parentNode : n).trim();if(/[A-Za-z]{2}/.test(source)&&!allowed.has(source)&&!Object.hasOwn(a.w.UFreeFrench.exact,source)&&a.w.UFreeI18n.translate(source)===source)missing.push(source);}
 else if(n.nodeType===1&&!['SCRIPT','STYLE','SVG','TEXTAREA'].includes(n.tagName)&&!n.hasAttribute('data-no-translate')){
 for(const key of ['aria-label','title','placeholder','alt']){const source=a.w.UFreeI18n.sourceAttribute(n,key);if(source&&/[A-Za-z]{2}/.test(source)&&!allowed.has(source)&&!Object.hasOwn(a.w.UFreeFrench.exact,source)&&a.w.UFreeI18n.translate(source)===source)missing.push(source);}
 for(const child of n.childNodes)walk(child);if(n.tagName==='TEMPLATE')for(const child of n.content.childNodes)walk(child);
 }};walk(a.w.document.documentElement);assert.deepEqual([...new Set(missing)],[]);
 assert.match(a.el('helpModal').textContent,/Avis de confidentialité/);assert.match(a.el('helpModal').textContent,/Aucun compte requis/);
 a.lang('en');assert.match(a.el('peopleList').textContent,/Add your first schedule/);assert.match(a.el('helpModal').textContent,/Privacy Notice/);
 }finally{await a.close();}
});

test('names, courses, instructors, room names and group names matching UI labels are never translated',async()=>{
 const a=await app({language:'fr',groups:[{id:'g',name:'Settings',members:['Settings','Monday']}]});try{
 const before=a.stored();let heading=a.el('peopleList').querySelector('.people-group h3');assert.equal(heading.textContent,'Settings');
 assert.equal(a.el('peopleList').querySelector('[data-person="Settings"] .person-select-button').textContent,'Settings');
 a.el('peopleList').querySelector('[data-person="Settings"] .person-select-button').click();a.el('fullScheduleButton').click();
 assert.equal(a.el('personWeekTitle').textContent,'Settings');assert.match(a.el('personWeekGrid').textContent,/Settings.*Monday[\s\S]*Free/);
 a.lang('en');a.lang('fr');assert.equal(a.el('personWeekTitle').textContent,'Settings');assert.equal(a.stored(),before);
 }finally{await a.close();}
});

test('English and French exports have identical transport payloads and keep working with QR',async()=>{
 const a=await app();try{
 const before=a.stored();a.el('homeExportButton').click();a.el('generateCodeButton').click();await a.wait(()=>!a.el('generateCodeButton').disabled);const english=a.el('exportCodeOutput').value;
 a.lang('fr');a.el('generateCodeButton').click();await a.wait(()=>!a.el('generateCodeButton').disabled);assert.equal(a.el('exportCodeOutput').value,english);
 assert.match(a.el('exportCodeStatus').textContent,/Code copié/);assert.doesNotMatch(a.el('exportCodeStatus').textContent,/Fits|characters|Code ready/);
 a.el('exportQrButton').click();await a.wait(()=>!a.el('exportQrButton').disabled);assert.ok(a.el('exportQr').querySelector('svg'));
 const payload=await a.w.WhosFreeShareCode.decode(a.el('exportSharePanel').querySelector('textarea').value);assert.deepEqual(Object.keys(payload.people),['Monday','Settings']);assert.equal(payload.people.Settings.classes[0].day,'Monday');assert.equal(payload.people.Settings.classes[0].course,'Settings');
 a.lang('en');assert.equal(a.el('exportCodeOutput').value,english);assert.equal(a.stored(),before);
 }finally{await a.close();}
});

test('manual entry validation, first-save welcome and copying translate without changing the saved record',async()=>{
 const a=await app({language:'fr',data:null});try{
 a.el('scheduleDataButton').click();a.el('manualScheduleButton').click();a.el('saveImageScheduleButton').click();await tick();assert.match(a.el('imageReviewError').textContent,/Saisissez le nom/);
 a.el('imageReviewName').value='David';a.el('saveImageScheduleButton').click();await a.wait(()=>!a.el('firstScheduleWelcome').hidden);await a.wait(()=>!a.el('copyFirstScheduleLink').disabled);
 assert.equal(a.el('firstScheduleWelcomeTitle').textContent,'Ajoutez maintenant vos amis!');const before=a.stored();a.el('copyFirstScheduleLink').click();await a.wait(()=>a.el('copyFirstScheduleLink').textContent==='Copié!');
 assert.ok(a.copied().startsWith('https://youfree.ca/#import='));a.lang('en');assert.equal(a.el('firstScheduleWelcomeTitle').textContent,'Now, add your friends!');assert.equal(a.el('copyFirstScheduleLink').textContent,'Copied!');assert.equal(a.stored(),before);
 }finally{await a.close();}
});

test('dynamic progress, errors, counts and nested messages switch live and round-trip',async()=>{
 const a=await app();try{
 const ui=a.w.UFreeI18n;const node=a.w.document.createElement('p');a.w.document.body.append(node);
 for(const [english,expected]of[
 ['Code ready for 2 schedules · 100 characters. Fits a 1,000-character message.',/Code prêt pour 2 horaires.*Tient/],
 ['Checking schedules: 2 of 8… You can close this view to cancel.',/Vérification des horaires : 2 sur 8/],
 ['This code is incomplete or changed. Paste the full export code.',/incomplet/],
 ['The classes for Settings are not in the expected format.',/cours de Settings/],
 ['QR 1 of 3 · 2 people',/QR 1 sur 3 · 2 personnes/],
 ['Settings · 2 classes · Fall 2026',/Settings · 2 cours · Automne 2026/],
 ['Monday timeline',/Journée du Lundi/],
 ['Added 2 people · Skipped 1',/Personnes ajoutées : 2 · Ignorées : 1/],
 ]){
 a.lang('en');ui.setText(node,english);a.lang('fr');assert.match(node.textContent,expected,english);assert.doesNotMatch(node.textContent,/\{\d|\(s\)/);a.lang('en');assert.equal(node.textContent,english);
 }
 }finally{await a.close();}
});

test('language switching still works when preference storage is blocked',async()=>{
 const a=await app({blocked:true});try{a.lang('fr');assert.equal(a.el('settingsButton').textContent,'Paramètres');a.lang('en');assert.equal(a.el('settingsButton').textContent,'Settings');}finally{await a.close();}
});

test('sidebar keyboard focus includes the flag and remains stable when switching',async()=>{
 const a=await app();try{
 a.el('mobileMenuButton').click();const button=a.el('languageToggleButton');button.focus();button.click();assert.equal(a.w.document.activeElement,button);
 a.w.document.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));assert.equal(a.w.document.activeElement,a.el('closeMobileMenuButton'));
 a.w.document.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal(a.w.document.activeElement,a.el('mobileMenuButton'));assert.equal(a.el('mobileMenuButton').getAttribute('aria-label'),'Ouvrir le menu principal');
 }finally{await a.close();}
});

test('group exports and received-group choices work in French and keep names and member identities',async()=>{
 const sender=await app({language:'fr',groups:[{id:'g',name:'Settings',members:['Settings','Monday']}]});
 const receiver=await app({language:'fr',data:null});try{
 sender.el('peopleList').querySelector('[data-share-group="g"]').click();assert.match(sender.el('scheduleModalTitle').textContent,/Partager le groupe : Settings/);
 sender.el('generateCodeButton').click();await sender.wait(()=>!sender.el('generateCodeButton').disabled);
 const code=sender.el('exportCodeOutput').value,decoded=await sender.w.WhosFreeShareCode.decode(code);assert.equal(decoded.shared_group.name,'Settings');
 receiver.el('homeImportButton').click();receiver.el('importCodeInput').value=code;receiver.el('decodeCodeButton').click();await receiver.wait(()=>!receiver.el('sharedGroupImport').hidden);
 assert.match(receiver.el('sharedGroupImport').textContent,/Un groupe a été partagé/);assert.equal(receiver.el('sharedGroupName').value,'Settings');assert.match(receiver.el('sharedGroupSummary').textContent,/Settings · 2 membres/);
 receiver.el('addSharedGroupButton').click();await receiver.wait(()=>receiver.el('scheduleModal').hidden);assert.match(receiver.el('toast').textContent,/Personnes ajoutées : 2/);
 assert.deepEqual(Object.keys(JSON.parse(receiver.stored()).data.people).sort(),['Monday','Settings']);
 const prefs=JSON.parse(receiver.w.localStorage.getItem('whos-free-groups-v1'));assert.equal(prefs.groups[0].name,'Settings');
 }finally{await sender.close();await receiver.close();}
});

test('French QR export automatically splits, keeps progress localized and preserves every original schedule',async()=>{
 let seed=123;const random=n=>Array.from({length:n},()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[seed%62];}).join('');
 const data={people:Object.fromEntries(Array.from({length:6},(_,i)=>['Person '+i,{semester:'Fall 2026',classes:['Monday','Wednesday','Friday'].map(day=>({day,start:'09:00',end:'10:00',course:random(180),room:'A-100',course_code:'201-NYA-05',section:'00001',instructor:'Teacher',kind:'class'}))}]))};
 const a=await app({language:'fr',data});try{
 const links=[],gen=a.w.qrcodegen.QrCode,original=gen.encodeText;gen.encodeText=(link,level)=>{links.push(link);return original.call(gen,link,level);};
 a.el('homeExportButton').click();a.el('exportFieldOptions').querySelector('.export-include-all').click();a.el('exportQrButton').click();assert.match(a.el('exportSharePanel').querySelector('.share-link-status').textContent,/Préparation/);
 await a.wait(()=>!a.el('exportQrButton').disabled);assert.ok(links.length>1);assert.match(a.el('exportSharePanel').querySelector('.share-link-status').textContent,/codes QR indépendants/);
 const received={};for(const link of links)Object.assign(received,(await a.w.WhosFreeShareCode.decode(link)).people);assert.deepEqual(plain(received),data.people);
 assert.match(a.el('multipleQrCodes').querySelector('h4').textContent,/QR 1 sur/);assert.equal(a.el('multipleQrButton'),null);
 a.lang('en');assert.match(a.el('multipleQrCodes').querySelector('h4').textContent,/QR 1 of/);assert.equal(links.length,a.el('multipleQrCodes').querySelectorAll('svg').length);
 }finally{await a.close();}
});

test('nickname edits stay intact when switching and new settings feedback stays translated',async()=>{
 const a=await app({language:'fr'});try{
 a.el('settingsButton').click();const row=a.el('notificationPeopleList').querySelector('[data-person="Settings"]');assert.ok(row);const input=row.querySelector('input');input.value='Keep this draft';
 a.lang('en');a.lang('fr');assert.equal(input.value,'Keep this draft');input.dispatchEvent(new a.w.Event('change',{bubbles:true}));
 assert.match(a.el('toast').textContent,/Surnom enregistré : Keep this draft/);assert.equal(a.w.document.getElementById('languageToggleButton').querySelector('img').getAttribute('alt'),'English');
 }finally{await a.close();}
});

test('unknown browser error details are preserved while the surrounding message is translated',async()=>{
 const a=await app({language:'fr'});try{
 const node=a.w.document.createElement('p');a.w.document.body.append(node);a.w.UFreeI18n.setText(node,'That file could not be loaded: UnusualBrowserError 123');assert.equal(node.textContent,'Impossible de charger ce fichier : UnusualBrowserError 123');
 a.lang('en');assert.equal(node.textContent,'That file could not be loaded: UnusualBrowserError 123');
 }finally{await a.close();}
});

test('French translations and both flag images are included in the offline app shell',()=>{
 const sw=read('service-worker.js'),html=read('index.html');
 for(const name of ['i18n-fr.js','i18n.js']){const url=html.match(new RegExp('src="('+name.replace('.','\\.')+'\\?v=\\d+)"'))[1];assert.ok(sw.includes('"./'+url+'"'));}
 for(const flag of ['flag-fr.svg','flag-uk.svg'])assert.ok(sw.includes('"./assets/'+flag+'"'));
});
