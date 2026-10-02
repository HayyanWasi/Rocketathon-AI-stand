import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLessonQuestion} from '../public/request-context.js';
const latest={status:'answer',answer:'At the same wavelength, a wider gap causes less spreading. The outgoing crests are flatter, with some curvature.',check:{question:'At fixed wavelength, what happens when the gap becomes narrower?',solution:'SECRET HIDDEN CHECK SOLUTION'}};
test('ordinary questions retain exact text and their original topic scope',()=>{
  for(const question of ['Explain electric circuits.','  How do plants grow?  ','Why?'])assert.equal(buildLessonQuestion(question,latest,'Why does diffraction occur?'),question);
  assert.equal(buildLessonQuestion('x'.repeat(1200),latest,'Diffraction'),'x'.repeat(1200));
});
test('explicit follow-up adds bounded context without changing the student request',()=>{
  const question='Explain it differently using one simple example.',previous='Why do wavefronts spread less through a wider gap?';
  const result=buildLessonQuestion(question,latest,previous,{followup:true});assert.match(result,/Diffraction follow-up/);assert.ok(result.includes(previous));assert.ok(result.includes(latest.answer));assert.ok(result.endsWith(question));assert.ok(result.length<=1200);assert.ok(!result.includes(latest.check.solution));
});
test('check answer includes the full check and student attempt, never its hidden solution',()=>{
  const attempt='I think less spreading because the gap is smaller.';
  const result=buildLessonQuestion(attempt,latest,'Previous question',{answerCheck:true});assert.ok(result.includes(latest.check.question));assert.ok(result.endsWith(attempt));assert.match(result,/new lesson answer \(status: answer\)/);assert.ok(!result.includes(latest.check.solution));assert.ok(!result.includes(latest.answer));assert.ok(result.length<=1200);
});
test('long context is reduced while retaining the complete student follow-up',()=>{
  const question='Please explain why. '+ 'detail '.repeat(40);
  const result=buildLessonQuestion(question,{...latest,answer:'Explanation '.repeat(300)},'Original question '.repeat(100),{followup:true});assert.ok(result.length<=1200);assert.ok(result.endsWith(question));assert.match(result,/Original question/);assert.match(result,/Explanation/);
});
test('oversized or context-starved explicit actions fail instead of truncating the student',()=>{
  assert.throws(()=>buildLessonQuestion('x'.repeat(1201),latest,'Previous'),/1,200/);
  assert.throws(()=>buildLessonQuestion('x'.repeat(1100),latest,'Previous question',{followup:true}),/Shorten this follow-up/);
  assert.throws(()=>buildLessonQuestion('x'.repeat(1100),latest,'Previous',{answerCheck:true}),/Shorten your check answer/);
  assert.throws(()=>buildLessonQuestion('Why?',null,'Previous',{followup:true}),/no previous explanation/);
  assert.throws(()=>buildLessonQuestion('Less',null,'Previous',{answerCheck:true}),/no understanding check/);
});
test('explicit check takes precedence when both options are supplied',()=>{
  const result=buildLessonQuestion('More spreading',latest,'Prior',{followup:true,answerCheck:true});assert.match(result,/understanding check/);assert.ok(!result.includes('Previous explanation'));
});
