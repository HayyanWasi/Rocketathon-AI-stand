import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeLesson,normalizeLibrary} from '../public/api-contract.js';
const corpus={source:{videoId:'H5ygtkokVsI',url:'https://www.youtube.com/watch?v=H5ygtkokVsI&t=595s',title:'MAC revision',channel:'Physics with MAC'},passages:[{id:'D06',start:26532.8,time:'spoofed',title:'A wider gap',text:'At fixed wavelength the waves spread less.'}]};
const remoteLibrary={passages:corpus};
const answer={status:'answer',answer:'Waves spread less.',speech_text:'لہریں کم پھیلتی ہیں۔',citations:[{id:'D06',url:'/api/passage?id=D06',start:99,time:'wrong',title:'Incorrect remote metadata',excerpt:'Untrusted text'}],check:{question:'What changes?',solution:'The spreading.',speech:'کیا بدلتا ہے؟'},board:{title:'Diffraction',steps:['Keep wavelength fixed.'],equation:'',diagram:[]},provider:'local-llm'};
test('nested remote library and flat library normalize to the same verified corpus',()=>{
  const a=normalizeLibrary(remoteLibrary),b=normalizeLibrary(corpus);assert.deepEqual(a,b);assert.equal(a.index,null);assert.equal(a.source.url,'https://www.youtube.com/watch?v=H5ygtkokVsI');assert.equal(a.passages[0].time,'7:22:12');assert.equal(a.passages[0].start,26532);assert.equal(corpus.passages[0].start,26532.8);
});
test('lesson citations become external timestamp links from library metadata only',()=>{
  const lesson=normalizeLesson(answer,remoteLibrary);assert.equal(lesson.knowledgeMode,'lecture');assert.equal(lesson.citations[0].url,'https://www.youtube.com/watch?v=H5ygtkokVsI&t=26532s');assert.equal(lesson.citations[0].title,'A wider gap');assert.equal(lesson.citations[0].excerpt,corpus.passages[0].text);assert.equal(lesson.speech_text,answer.speech_text);assert.equal(lesson.check.speech,answer.check.speech);
});
test('unknown, conflicting, missing and excessive citations cannot claim lecture provenance',()=>{
  assert.throws(()=>normalizeLesson({...answer,citations:[{id:'fake',url:'javascript:alert(1)'}]},remoteLibrary),/unknown passage/);
  assert.throws(()=>normalizeLesson(answer,{...corpus,passages:[{...corpus.passages[0],conflict:true}]}),/conflicting/);
  assert.throws(()=>normalizeLesson({...answer,citations:[]},remoteLibrary),/verified passage/);
  assert.throws(()=>normalizeLesson({...answer,citations:'D06'},remoteLibrary),/citations must be an array/);
  const many={...corpus,passages:Array.from({length:5},(_,i)=>({...corpus.passages[0],id:'D'+i}))};
  assert.throws(()=>normalizeLesson({...answer,citations:many.passages.map(p=>({id:p.id}))},many),/too many/);
});
test('bad source IDs, duplicate passage IDs and absent timestamps reject the library',()=>{
  assert.throws(()=>normalizeLibrary({...corpus,source:{url:'javascript:alert(1)'}}),/YouTube/);
  assert.throws(()=>normalizeLibrary({...corpus,passages:[corpus.passages[0],corpus.passages[0]]}),/unique/);
  assert.throws(()=>normalizeLibrary({...corpus,passages:[{...corpus.passages[0],start:null}]}),/timestamp/);
  assert.equal(normalizeLibrary({...corpus,source:{url:'https://youtu.be/H5ygtkokVsI'}}).source.videoId,'H5ygtkokVsI');
});
test('unsupported lesson statuses and incomplete teaching structures fail clearly',()=>{
  for(const status of ['greeting','clarify','feedback',null])assert.throws(()=>normalizeLesson({...answer,status},remoteLibrary),/unsupported status/);
  assert.throws(()=>normalizeLesson(null,remoteLibrary),/lesson object/);
  assert.throws(()=>normalizeLesson({...answer,check:null},remoteLibrary),/check is incomplete/);
  assert.throws(()=>normalizeLesson({...answer,board:{title:'',steps:[]}},remoteLibrary),/empty/);
});
test('bounded primitives require coordinates instead of drawing invented zero-position shapes',()=>{
  const diagram=[null,{type:'script',text:'alert(1)'},{type:'line',x:5,y:5},{type:'circle',x:20,y:20},{type:'arc',x:2,y:2,radius:5,startAngle:NaN,endAngle:90},{type:'text',x:5,y:5,text:''},{type:'line',x:-9,y:120,x2:30,y2:40},{type:'circle',x:20,y:20,radius:-10},{type:'arc',x:10,y:20,radius:100,startAngle:-900,endAngle:900},{type:'text',x:30,y:40,text:'Waves',x2:'not-used'}];
  const lesson=normalizeLesson({...answer,board:{...answer.board,diagram}},remoteLibrary);assert.equal(lesson.board.diagram.length,4);assert.deepEqual(lesson.board.diagram[0],{type:'line',x:0,y:100,x2:30,y2:40});assert.equal(lesson.board.diagram[1].radius,0);assert.equal(lesson.board.diagram[2].radius,70);assert.equal(lesson.board.diagram[2].startAngle,-360);assert.deepEqual(lesson.board.diagram[3],{type:'text',x:30,y:40,text:'Waves'});
});
test('referrals clear instructional data and explicit general explanations carry no citations',()=>{
  const referral=normalizeLesson({...answer,status:'escalate',reason:'outside_topic'});assert.equal(referral.board,null);assert.equal(referral.check,null);assert.deepEqual(referral.citations,[]);
  const general=normalizeLesson({...answer,knowledgeMode:'general',citations:[]});assert.equal(general.knowledgeMode,'general');assert.deepEqual(general.citations,[]);assert.throws(()=>normalizeLesson({...answer,knowledgeMode:'general'},remoteLibrary),/cannot claim/);
});
