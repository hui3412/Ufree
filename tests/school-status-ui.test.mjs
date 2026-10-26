import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Window} from 'happy-dom';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');
test('school labels follow daily boundaries, breaks, overlaps and language',async()=>{
 const w=new Window({url:'https://hui3412.github.io/Ufree/',settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}});
 try {
 w.document.write(read('index.html'));w.setInterval=()=>0;w.matchMedia=()=>({matches:false,addEventListener(){}});
 const classes=[['Monday','09:00','11:00'],['Monday','10:00','10:30'],['Monday','12:00','13:00'],['Monday','13:05','14:00'],['Tuesday','09:00','10:00']].map(([day,start,end])=>({day,start,end}));
 w.localStorage.setItem('whos-free-local-schedules',JSON.stringify({data:{people:{Student:{semester:'Fall 2026',classes},Empty:{semester:'Fall 2026',classes:[]}}},meta:{}}));
 w.localStorage.setItem('whos-free-view-mode-v1','all');
 for(const f of ['i18n-fr.js','i18n.js','schedule-availability.js','schedule-groups.js','app.js'])w.eval(read(f));
 await new Promise(r=>setTimeout(r,50));
 const el=id=>w.document.getElementById(id);
 const badge=()=>el('peopleList').querySelector('[data-person="Student"] .status-badge');
 const at=(day,time)=>{el('daySelect').value=day;el('daySelect').dispatchEvent(new w.Event('change'));el('timeInput').value=time;el('timeInput').dispatchEvent(new w.Event('input'));return badge().textContent;};
 for(const [day,time,label] of [['Monday','00:00','Free before school'],['Monday','08:59','Free before school'],['Monday','09:00','IN CLASS'],['Monday','10:30','IN CLASS'],['Monday','11:00','FREE'],['Monday','13:00','Class Soon'],['Monday','14:00','Free after school'],['Monday','23:59','Free after school'],['Tuesday','00:00','Free before school'],['Sunday','00:00','FREE']])assert.equal(at(day,time),label);
 assert.equal(el('peopleList').querySelector('[data-person="Empty"] .status-badge').textContent,'FREE');
 at('Monday','08:00');el('peopleList').querySelector('[data-person="Student"] .person-select-button').click();
 assert.equal(el('detailPanel').querySelector('.status-badge').textContent,'Free before school');
 w.UFreeI18n.setLanguage('fr');assert.equal(badge().textContent,'Libre avant les cours');
 assert.equal(el('detailPanel').querySelector('.status-badge').textContent,'Libre avant les cours');
 assert.equal(at('Monday','14:00'),'Libre après les cours');
 }finally{await w.happyDOM.abort();}
});
