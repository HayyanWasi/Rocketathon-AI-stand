import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadBase} from '../backend/context.mjs';
import {tokenize,selectTopic,rankPassages,selectSkills} from '../backend/retrieval.mjs';
import {validateLesson,escalate} from '../backend/lesson.mjs';

// Read-only and pure checks: never clear/write the real student profile or
// session, and never invoke an LLM or speech provider.
const {persona,syllabusIndex,skillIndex}=await loadBase();
const corpus=JSON.parse(await fs.readFile(new URL('../data/passages.json',import.meta.url),'utf8'));
const supported=()=>({status:'answer',source_ids:['D06'],answer:'A wider gap means less spreading.',check_question:'What changes?',check_answer:'Spreading',board:{title:'A wider gap',steps:['Less diffraction occurs'],equation:'',diagram:[]}});

test('standing persona identifies the AI representation and loads the nested syllabus',()=>{
 assert.match(persona,/AI representation/);assert.match(persona,/never Sir Mahad speaking live/);assert.ok(Array.isArray(skillIndex));
 const topic=selectTopic('Why do wavefronts spread?',syllabusIndex);assert.equal(topic.id,'diffraction');assert.equal(topic.chapter,'waves');assert.equal(topic.passagesFile,'data/passages.json');
 assert.equal(selectTopic('Please explain electric circuits from scratch',syllabusIndex),null);assert.ok(corpus.passages.length>0);
});
test('retrieval selects relevant lecture evidence and respects the requested limit',()=>{
 assert.equal(rankPassages('wider gap less spreading',corpus.passages)[0].id,'D06');assert.deepEqual(rankPassages('xyzzy banana',corpus.passages),[]);
 assert.ok(rankPassages('gap wavefront wavelength',corpus.passages,2).length<=2);assert.deepEqual(rankPassages('',corpus.passages),[]);
 assert.deepEqual(tokenize('Gap ke baad WAVELENGTH!'),['gap','baad','wavelength']);
});
test('short follow-ups can retain the selected topic and activate needed teaching skills',()=>{
 assert.equal(selectTopic('Why?',syllabusIndex,{currentTopic:'diffraction'}).id,'diffraction');
 assert.equal(selectTopic('Why?',syllabusIndex,{currentTopic:'missing'}),null);
 const selected=selectSkills('Draw a diagram for the exam; my answer is wrong',skillIndex);
 for(const id of ['draw-diagram','exam-coaching','correct-misconception'])assert.ok(selected.includes(id));assert.equal(new Set(selected).size,selected.length);
});
test('unsupported and conflicting sources cannot produce a supported lesson',()=>{
 assert.equal(escalate('insufficient_source').citations.length,0);assert.equal(escalate('outside_topic').status,'escalate');
 assert.throws(()=>validateLesson({...supported(),source_ids:['invented']},corpus,['D06']),/citations/);
 assert.throws(()=>validateLesson({...supported(),source_ids:[]},corpus,[]),/citations/);
 const conflicting={...corpus,passages:corpus.passages.map(p=>p.id==='D06'?{...p,conflict:true}:p)};
 assert.equal(validateLesson(supported(),conflicting,['D06']).reason,'conflicting_source');
});
test('validated lessons retain speech/check fields and the current passage API contract',()=>{
 const input={...supported(),speech_text:'اردو وضاحت',check_speech:'سوال'},output=validateLesson(input,corpus,['D06']);
 assert.equal(output.speech_text,input.speech_text);assert.equal(output.check.speech,input.check_speech);assert.equal(output.check.solution,input.check_answer);
 assert.equal(output.citations[0].id,'D06');assert.equal(output.citations[0].url,'/api/passage?id=D06');assert.equal(output.citations[0].excerpt,corpus.passages.find(p=>p.id==='D06').text);assert.equal(output.provider,'local-llm');
});
test('validated boards restrict executable primitives and bound diagram coordinates',()=>{
 const input=supported();input.board.diagram=[{type:'script',text:'alert(1)'},{type:'line',x:200,y:-10,x2:Infinity,y2:25},{type:'circle',x:50,y:50,radius:100}];
 const output=validateLesson(input,corpus,['D06']);assert.equal(output.board.diagram.length,2);assert.equal(output.board.diagram[0].x,100);assert.equal(output.board.diagram[0].y,0);assert.equal(output.board.diagram[0].x2,0);assert.equal(output.board.diagram[1].radius,70);
 assert.throws(()=>validateLesson({...supported(),check_answer:''},corpus,['D06']),/omitted/);
});
