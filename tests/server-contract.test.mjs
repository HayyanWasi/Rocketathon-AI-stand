import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const scratch=os.tmpdir();
const listen=server=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve(server.address().port));});
const close=server=>new Promise(resolve=>{server.closeAllConnections?.();server.close(resolve);});

test('the unchanged server completes a sourced chat against isolated loopback Ollama', {timeout:30000}, async()=>{
 await fs.mkdir(scratch,{recursive:true});const temp=await fs.mkdtemp(path.join(scratch,'mahad-server-contract-'));
 let child,provider,logs='',exitCode=null;const calls=[];
 try{
  // Import paths resolve inside this copy; the real student's runtime is never
  // read, written, cleared or copied. Runtime credentials and .env files are not copied.
  for(const name of ['backend','teacher','skills','syllabus'])await fs.cp(path.join(root,name),path.join(temp,name),{recursive:true});
  await fs.mkdir(path.join(temp,'data'));
  for(const name of ['passages.json','teacher.json'])await fs.copyFile(path.join(root,'data',name),path.join(temp,'data',name));
  await fs.copyFile(path.join(root,'server.mjs'),path.join(temp,'server.mjs'));
  const corpus=JSON.parse(await fs.readFile(path.join(temp,'data/passages.json'),'utf8'));
  const passage=corpus.passages.find(p=>p.id==='D06');assert.ok(passage);
  const fixture={status:'answer',source_ids:[passage.id],answer:passage.text,speech_text:'بڑے گیپ سے لہریں کم پھیلتی ہیں۔',check_question:'If the gap gets wider, does spreading increase or decrease?',check_answer:'Spreading decreases at the same wavelength.',check_speech:'لہروں کا پھیلاؤ زیادہ ہوگا یا کم؟',board:{title:passage.title,steps:['Compare the gap with the wavelength.','A wider gap produces less spreading.'],equation:'',diagram:[]}};
  provider=http.createServer(async(req,res)=>{
   if(req.url==='/api/tags'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({models:[{name:'contract-fixture:latest'}]}));return;}
   const parts=[];for await(const part of req)parts.push(part);const body=JSON.parse(Buffer.concat(parts).toString());calls.push(body);
   res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({message:{role:'assistant',content:JSON.stringify(fixture)}}));
  });
  const providerPort=await listen(provider),probe=http.createServer(),port=await listen(probe);await close(probe);
  child=spawn(process.execPath,['server.mjs'],{cwd:temp,windowsHide:true,env:{...process.env,PORT:String(port),OLLAMA_HOST:`http://127.0.0.1:${providerPort}`,OLLAMA_MODEL:'contract-fixture',WHISPER_PYTHON:'no-python-contract-fixture'}});
  child.stdout.on('data',value=>logs+=value);child.stderr.on('data',value=>logs+=value);child.on('exit',value=>exitCode=value);child.on('error',error=>logs+=error.message);
  const base=`http://127.0.0.1:${port}`,deadline=Date.now()+15000;let libraryResponse,library;
  while(Date.now()<deadline){
   try{libraryResponse=await fetch(base+'/api/library',{signal:AbortSignal.timeout(800)});library=await libraryResponse.json();break;}
   catch{if(exitCode!=null)throw Error('Isolated server exited: '+logs);await new Promise(resolve=>setTimeout(resolve,100));}
  }
  assert.ok(library,'Server did not start: '+logs);assert.equal(libraryResponse.status,200);
  assert.ok(Array.isArray(library.passages.passages),'current library wraps the corpus');assert.equal(library.passages.source.videoId,corpus.source.videoId);
  const question='Why does a wider gap cause less spreading?';
  const response=await fetch(base+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question}),signal:AbortSignal.timeout(10000)}),answer=await response.json();
  assert.equal(response.status,200,JSON.stringify(answer)+'\n'+logs);assert.equal(answer.status,'answer');assert.equal(answer.provider,'local-llm');assert.equal(answer.answer,passage.text);assert.equal(answer.speech_text,fixture.speech_text);
  assert.deepEqual(answer.citations.map(c=>c.id),['D06']);assert.equal(answer.check.question,fixture.check_question);assert.equal(answer.board.steps.length,2);
  const generation=calls.find(call=>call.format);assert.ok(generation,'structured generation reached loopback Ollama');assert.ok(generation.messages.some(message=>message.content.includes('[D06]')),'only real retrieved lecture evidence grounds the fixture');
  const citationResponse=await fetch(base+answer.citations[0].url,{signal:AbortSignal.timeout(3000)});assert.equal(citationResponse.status,200);assert.equal((await citationResponse.json()).text,passage.text);
  const isolatedState=JSON.parse(await fs.readFile(path.join(temp,'runtime/student/session-state.json'),'utf8'));assert.equal(isolatedState.recentTurns.length,2);assert.equal(isolatedState.recentTurns[0].content,question);
 }finally{
  if(child){child.kill();await new Promise(resolve=>{if(child.exitCode!=null||child.signalCode!=null)return resolve();const timer=setTimeout(resolve,2000);timer.unref();child.once('exit',()=>{clearTimeout(timer);resolve();});});}
  if(provider)await close(provider);
  const target=path.resolve(temp),allowed=path.resolve(scratch)+path.sep;
  assert.ok(target.toLowerCase().startsWith(allowed.toLowerCase()),'cleanup stays within the test scratch directory');await fs.rm(target,{recursive:true,force:true});
 }
});
