import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeLessonText} from '../public/lesson-text.js';
import {Blackboard} from '../public/board.js';
import {TeacherAvatar} from '../public/avatar.js';

// Only DOM operations used by the board are represented here. No provider,
// student memory or network requests are needed for these frontend contracts.
class Node {
 constructor(tag){this.tag=tag;this.textContent='';this.children=[];this.hidden=false;this.attributes={};this.style={};this.classes=new Set();this.classList={toggle:(name,enabled)=>enabled?this.classes.add(name):this.classes.delete(name)};}
 append(node){this.children.push(node);}
 replaceChildren(...nodes){this.children=nodes;}
 setAttribute(name,value){this.attributes[name]=String(value);}
}
function boardDOM(){
 const nodes=new Map();const document={querySelector(selector){if(!nodes.has(selector))nodes.set(selector,new Node('div'));return nodes.get(selector);},createElement:tag=>new Node(tag),createElementNS:(_,tag)=>new Node(tag)};
 globalThis.document=document;return {document,nodes,at:selector=>document.querySelector(selector)};
}
const lesson=()=>({title:'Diffraction',steps:['Narrow gap: more spreading.','Wider gap: less spreading.'],equation:String.raw`\(v = f \lambda\)`,diagram:[]});

test('display math uses readable symbols, fractions, powers and indices',()=>{
 assert.equal(normalizeLessonText(String.raw`\(v = f \lambda\)`),'v = f λ');
 assert.equal(normalizeLessonText(String.raw`$$F = 2 \times 3\,m/s^{2}$$`),'F = 2 × 3 m/s²');
 assert.equal(normalizeLessonText(String.raw`\lambda = \frac{v}{f}`),'λ = v/f');
 assert.equal(normalizeLessonText(String.raw`\frac{x + 1}{\frac{2}{3}}`),'(x + 1)/(2/3)');
 assert.equal(normalizeLessonText(String.raw`v_{0} = 5 m s^{-1}`),'v₀ = 5 m s⁻¹');
 assert.equal(normalizeLessonText('x^{abc}'),'x^(abc)');
 assert.equal(normalizeLessonText(String.raw`\unknown{test}`),String.raw`\unknown{test}`);
 assert.equal(normalizeLessonText('Prices are $5 and $10.'),'Prices are $5 and $10.');
 assert.equal(normalizeLessonText(null),'');
});
test('plain display text and unsupported notation remain readable',()=>{
 assert.equal(normalizeLessonText('Beta, same medium mein wavelength same hai.'),'Beta, same medium mein wavelength same hai.');
 assert.equal(normalizeLessonText(String.raw`$\theta = 45\degree$`),'θ = 45°');
 assert.equal(normalizeLessonText(String.raw`\mathrm{m}\,s^{-2}`),'m s⁻²');
 assert.equal(normalizeLessonText('x_{initial}'),'x_(initial)');
});
test('the transcript board accepts the current lesson shape and normalizes its math',()=>{
 const {at}=boardDOM(),board=new Blackboard(),data=lesson(),changes=[];board.onChange=d=>changes.push(d);board.draw(data);
 assert.equal(board.data,data);assert.equal(changes[0],data);assert.equal(at('#board-empty').hidden,true);assert.equal(at('#board-content').hidden,false);
 assert.equal(at('#board-title').textContent,'Diffraction');assert.equal(at('#board-equation').textContent,'v = f λ');
 assert.deepEqual(at('#board-steps').children.map(n=>n.textContent),data.steps);assert.ok(at('#board-steps').children[0].classes.has('current-step'));
 assert.equal(at('#board-diagram').hidden,true);
});
test('generated drawings use data-only SVG primitives and render labels as literal text',()=>{
 const {at}=boardDOM(),board=new Blackboard(),data=lesson();data.diagram=[
  {type:'line',x:10,y:20,x2:30,y2:40},{type:'arrow',x:30,y:40,x2:50,y2:40},
  {type:'circle',x:50,y:50,radius:8},{type:'arc',x:50,y:50,radius:12,startAngle:0,endAngle:90},
  {type:'text',x:5,y:8,text:String.raw`\lambda <img src=x onerror=alert(1)>`},
  {type:'script',text:'alert(1)'}
 ];board.draw(data);const drawing=at('#board-diagram');
 assert.equal(drawing.hidden,false);assert.deepEqual(drawing.children.map(n=>n.tag),['path','path','circle','path','text']);
 assert.equal(drawing.children[0].attributes.d,'M 10 20 L 30 40');assert.match(drawing.children[1].attributes.d,/M 30 40 L 50 40/);
 assert.equal(drawing.children[2].attributes.r,'8');assert.match(drawing.children[3].attributes.d,/ A 12 12 0 0 1 /);
 assert.equal(drawing.children[4].textContent,'λ <img src=x onerror=alert(1)>');assert.equal(drawing.children[4].children.length,0);
});
test('a new lesson replaces previous board nodes and clearing notifies the classroom',()=>{
 const {at}=boardDOM(),board=new Blackboard(),changes=[];board.onChange=d=>changes.push(d);const first=lesson();first.diagram=[{type:'circle',x:10,y:10,radius:5}];board.draw(first);
 const second={title:'A new idea',steps:['Fresh reasoning'],equation:'',diagram:[]};board.draw(second);
 assert.deepEqual(at('#board-steps').children.map(n=>n.textContent),['Fresh reasoning']);assert.equal(at('#board-diagram').children.length,0);
 board.clear();assert.equal(board.data,null);assert.equal(changes.at(-1),null);assert.equal(at('#board-content').hidden,true);assert.equal(at('#board-empty').hidden,false);assert.equal(at('#replay-board').hidden,true);
});
test('classroom canvas paints the selected generated step and normalized diagram labels',()=>{
 const {at}=boardDOM(),texts=[],ellipses=[];const canvas={fillRect(){},strokeRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fillText(text,x,y){texts.push({text,x,y});},measureText(text){return {width:text.length*15};},ellipse(...values){ellipses.push(values);}};
 const actor=Object.create(TeacherAvatar.prototype);actor.boardCanvas={getContext:()=>canvas};actor.boardTexture={needsUpdate:false};actor.step=1;actor.boardData=lesson();actor.boardData.diagram=[{type:'text',x:20,y:20,text:String.raw`\lambda`},{type:'arc',x:50,y:50,radius:10,startAngle:0,endAngle:90}];actor.paintBoard();
 assert.ok(texts.some(t=>t.text.trim()==='Wider gap: less spreading.'));assert.ok(!texts.some(t=>t.text.includes('Narrow gap')));
 assert.ok(texts.some(t=>t.text.trim()==='v = f λ'));assert.ok(texts.some(t=>t.text==='λ'));assert.equal(at('#board-page').textContent,'Step 2 of 2');
 assert.equal(ellipses.length,1);assert.ok(Math.abs(ellipses[0][6]-Math.PI/2)<1e-10);assert.equal(actor.boardTexture.needsUpdate,true);assert.equal(actor.needsRender,true);
});
