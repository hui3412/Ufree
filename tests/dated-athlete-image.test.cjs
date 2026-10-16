const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const f = require('./fixtures/dated-athlete-axis.json');
const root = path.join(__dirname, '..');
const context = vm.createContext({ URL, setTimeout, clearTimeout, document: { baseURI: 'https://youfree.ca/' } });
for (const file of ['schedule-parser.js', 'schedule-dated-image-parser.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
const api = context.WhosFreeDatedImageParser, h = api.__test;
const word = ([text,x0,y0,x1,y1]) => ({text,x0,y0,x1,y1,cx:(x0+x1)/2,cy:(y0+y1)/2,height:y1-y0,confidence:95});
const words = f.items.map(word);
function canvas() {
  return {width:f.width,height:f.height,getContext(){return {getImageData(left,top,width,height){
    width=Math.floor(width);height=Math.floor(height);const data=new Uint8ClampedArray(width*height*4);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const sx=Math.floor(left)+x,sy=Math.floor(top)+y;
      const column=f.columns.find(c=>sx>=c.left&&sx<=c.right);
      const box=column&&f.regions.find(r=>r.day===column.day&&sy>r.top&&sy<r.bottom);
      let color=(sx<f.columns[0].left||sy<f.boundaries[0]||box)?[255,255,255]:[236,236,236];
      if([f.gutterLeft,...f.columns.map(c=>c.left),f.columns.at(-1).right].some(v=>Math.abs(sx-v)<.7))color=[211,211,211];
      // Faint JPEG row rules still span the entire narrow clock gutter.
      if(sx>=f.gutterLeft&&sx<f.columns[0].left&&f.boundaries.some(v=>Math.abs(sy-v)<.7))color=[248,248,248];
      if(column){const border=f.regions.find(r=>r.day===column.day&&(Math.abs(sy-r.top)<.7||Math.abs(sy-r.bottom)<.7));
        if(border)color=border.color==='orange'?[244,169,55]:border.color==='red'?[226,65,65]:[0,0,0];}
      data.set([...color,255],(y*width+x)*4);
    }return {data};
  }}}};
}
function geometry(){const image=canvas(),headers=h.datedHeaders(words),columns=h.detectColumns(image,headers),grid=h.detectRows(image,headers,columns),rows=h.validateClockRows(h.readClockRows(words,grid));return {image,regions:h.classRegions(image,columns,grid,rows),grid};}
const textWords=(region,lines)=>lines.map((text,i)=>word([text,region.left+12,(region.top+region.bottom)/2-15+i*10,region.right-12,(region.top+region.bottom)/2-8+i*10]));

test('narrow clock gutter and faint rules recover all 13 classes and 5 coloured athlete boxes',()=>{
  const {regions,grid}=geometry();assert.ok(Math.abs(grid.gutterLeft-f.gutterLeft)<2);assert.equal(regions.length,18);
  for(let i=0;i<regions.length;i++){
    assert.equal(regions[i].day,f.regions[i].day);assert.ok(Math.abs(regions[i].top-f.regions[i].top)<2);assert.ok(Math.abs(regions[i].bottom-f.regions[i].bottom)<2);
    if(!f.regions[i].athlete){assert.equal(regions[i].start,f.regions[i].start);assert.equal(regions[i].end,f.regions[i].end);}
  }
  assert.equal(regions.find(r=>r.day==='Tuesday'&&r.bottom>400).start,null);
});

test('printed athlete ranges override geometry and preserve the overlapping Monday class',()=>{
  const {regions}=geometry(),athletes=regions.filter((r,i)=>f.regions[i].athlete);
  for(const r of athletes){const item=h.classFromWords(textWords(r,['14:30 to 18:15','Athletes Student']),r);assert.equal(item.start,'14:30');assert.equal(item.end,'18:15');assert.equal(item.course,'Athletes Student');assert.equal(item.kind,'busy_block');assert.equal(item.explicitTime,undefined);}
  const monday=regions.find(r=>r.day==='Monday'&&r.start==='14:15');assert.equal(monday.end,'15:35');
  assert.throws(()=>h.classFromWords(textWords(athletes[1],['Athletes Student']),athletes[1]),/readable start and end/);
  assert.throws(()=>h.classFromWords(textWords(athletes[1],['18:15 to 14:30','Athletes Student']),athletes[1]),/readable start and end/);
});

test('small Classroom footer OCR never becomes instructor text',()=>{
  const r={...f.regions[0]},input=textWords(r,['Workshop','203-SN1-RE s.00001','D-307','Teacher.S']);
  input.push(word(['[Ciessroom|',r.right-30,r.bottom-7,r.right-3,r.bottom-2]));
  const item=h.classFromWords(input,r);assert.equal(item.instructor,'Teacher.S');assert.equal(item.room,'D-307');
});

for(const missingRange of [false,true])test(`fallback pipeline ${missingRange?'retries missing explicit hours':'accepts athlete labels without course codes'} and releases its worker`,async()=>{
  const all=[...words];for(const r of f.regions)all.push(...textWords(r,r.athlete?['14:30 to 18:15','Athletes Student']:['Workshop','203-SN1-RE s.00001','D-307','Teacher.S']));
  const data=values=>({blocks:[{paragraphs:[{lines:[{words:values.map(w=>({text:w.text,confidence:w.confidence,bbox:{x0:w.x0,y0:w.y0,x1:w.x1,y1:w.y1}}))}]}]}]});
  let recognized=0,terminated=0;
  const Tesseract={async createWorker(){return {async setParameters(){},async recognize(){recognized++;return {data:data(missingRange&&recognized===1?all.filter(w=>w.text!=='14:30 to 18:15'):all)}},async terminate(){terminated++}}}};
  // Rectangle OCR returns only that rectangle's words, like Tesseract.
  const create=Tesseract.createWorker;Tesseract.createWorker=async()=>{const worker=await create();worker.recognize=async(source,{rectangle})=>{recognized++;let values=all;if(rectangle)values=values.filter(w=>w.cx>rectangle.left&&w.cx<rectangle.left+rectangle.width&&w.cy>rectangle.top&&w.cy<rectangle.top+rectangle.height);if(missingRange&&recognized===1)values=values.filter(w=>w.text!=='14:30 to 18:15');return {data:data(values)}};return worker};
  const result=await api.parseScheduleCanvas(canvas(),'weekly.jpeg',{Tesseract});assert.equal(result.person.classes.length,18);assert.equal(result.person.classes.filter(c=>c.kind==='class').length,13);assert.equal(result.person.classes.filter(c=>c.start==='14:30'&&c.end==='18:15').length,5);assert.equal(terminated,1);assert.equal(result.needsReview,true);assert.ok(!JSON.stringify(result.person.classes).includes('Oct'));if(missingRange)assert.ok(recognized>1);
});
