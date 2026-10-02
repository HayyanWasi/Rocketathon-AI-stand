import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';

import {health, warmup, modelName} from './backend/llm.mjs';
import {synthesizeMixed, transcribe, ttsLabel, sttAvailable} from './backend/speech.mjs';
import {teach} from './backend/lesson.mjs';
import {loadBase} from './backend/context.mjs';
import {ensureStudentDir} from './backend/students.mjs';
import {getProfile, updateProfile, clearSession, resetMemory} from './backend/memory.mjs';

const root=path.dirname(fileURLToPath(import.meta.url)),pub=path.join(root,'public'),runtime=path.join(root,'runtime');
await fs.mkdir(runtime,{recursive:true});

const teacher=JSON.parse(await fs.readFile(path.join(root,'data/teacher.json'),'utf8'));
let notes=await readRuntime('approved-notes.json',[]);

async function readRuntime(file,fallback){try{return JSON.parse(await fs.readFile(path.join(runtime,file),'utf8'));}catch{return fallback;}}

const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};

function json(res,code,value){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
async function body(req,max=2e6){let n=0,parts=[];for await(const p of req){n+=p.length;if(n>max)throw Error('Request too large');parts.push(p);}return Buffer.concat(parts);}
function localOnly(req){const host=req.headers.host||'',origin=req.headers.origin;return /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)&&(!origin||/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin));}

const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(!localOnly(req))return json(res,403,{error:'Local access only'});res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  if(url.pathname==='/api/health'||url.pathname==='/api/config'){const s=await health();return json(res,200,{ok:true,provider:'local-llm',available:s.available,error:s.error||null,model:modelName(),tts:ttsLabel(),stt:sttAvailable()?'faster-whisper':'unavailable',topic:'Diffraction of waves'});}
  if(url.pathname==='/api/library'){const {index}=await loadBase();const passages=JSON.parse(await fs.readFile(path.join(root,'data/passages.json'),'utf8'));return json(res,200,{index, passages});}
  if(url.pathname==='/api/teacher')return json(res,200,{...teacher,approvedNotes:notes});
  if(url.pathname==='/api/chat'&&req.method==='POST'){const d=JSON.parse((await body(req,24000)).toString());if(typeof d.question!=='string'||!d.question.trim()||d.question.length>1200)return json(res,400,{error:'Enter a question of 1–1200 characters.'});const controller = new AbortController(); req.on('close', () => controller.abort()); const answer=await teach(d.question,{signal: controller.signal});return json(res,200,{id:randomUUID(),...answer});}
  if(url.pathname==='/api/session'&&req.method==='POST'){await clearSession();return json(res,200,{ok:true});}
  if(url.pathname==='/api/escalations'){let queue=await readRuntime('escalations.json',[]);if(req.method==='POST'){const d=JSON.parse((await body(req,12000)).toString());if(typeof d.question!=='string'||d.question.length>1200)return json(res,400,{error:'Invalid question'});queue.unshift({id:randomUUID(),question:d.question,reason:String(d.reason||'insufficient_source').slice(0,60),createdAt:new Date().toISOString(),status:'pending'});await fs.writeFile(path.join(runtime,'escalations.json'),JSON.stringify(queue,null,2));}return json(res,200,queue);}
  if(url.pathname==='/api/notes'&&req.method==='POST'){const d=JSON.parse((await body(req,10000)).toString());if(d.approved!==true||typeof d.text!=='string'||!d.text.trim()||d.text.length>2000||!d.evidence?.trim())return json(res,400,{error:'Exact note and approval reference are required.'});notes.push({id:randomUUID(),text:d.text.trim(),evidence:d.evidence.slice(0,500),createdAt:new Date().toISOString()});await fs.writeFile(path.join(runtime,'approved-notes.json'),JSON.stringify(notes,null,2));return json(res,200,notes);}
  if(url.pathname==='/api/tts'&&req.method==='POST'){const d=JSON.parse((await body(req,10000)).toString());if(typeof d.text!=='string'||!d.text.trim()||d.text.length>1800)return json(res,400,{error:'Invalid speech text'});const result=await synthesizeMixed(d.text);res.writeHead(200,{'Content-Type':'audio/wav','Cache-Control':'no-store'});return res.end(result);}
  if(url.pathname==='/api/transcribe'&&req.method==='POST'){const audio=await body(req,4e6);if(audio.toString('ascii',0,4)!=='RIFF')return json(res,400,{error:'Please record WAV audio.'});return json(res,200,await transcribe(audio));}
  if(url.pathname==='/api/student'&&req.method==='GET')return json(res,200,await getProfile());
  if(url.pathname==='/api/student'&&req.method==='POST'){const fields=JSON.parse((await body(req,10000)).toString());await updateProfile(fields);return json(res,200,{ok:true});}
  if(url.pathname==='/api/passage'&&req.method==='GET'){const id=url.searchParams.get('id');const passages=JSON.parse(await fs.readFile(path.join(root,'data/passages.json'),'utf8'));const passage=passages.passages?.find?.(p=>p.id===id) || passages.find?.(p=>p.id===id);if(!passage)return json(res,404,{error:'Not found'});return json(res,200,passage);}
  if(url.pathname==='/api/memory'&&req.method==='DELETE'){await resetMemory();return json(res,200,{ok:true});}
  if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});const base=url.pathname.startsWith('/vendor/')?path.join(root,'node_modules'):pub,rel=url.pathname.startsWith('/vendor/')?url.pathname.slice(8):(url.pathname==='/'?'index.html':url.pathname.slice(1)),target=path.resolve(base,decodeURIComponent(rel));if(!target.startsWith(base+path.sep))return json(res,403,{error:'Invalid path'});const file=await fs.readFile(target);res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream'});res.end(file);
}catch(e){json(res,e.code==='ENOENT'?404:400,{error:e.message||'Request failed'});}});

await ensureStudentDir();
warmup().catch(e=>console.error('Warmup failed', e));

const port=Number(process.env.PORT||4317);server.listen(port,'127.0.0.1',async ()=>{
  const h=await health();
  console.log(`Sir Mahad’s Physics Stand-In · http://127.0.0.1:${port}`);
  console.log(`Model: ${modelName()} (${h.available?'available':'unavailable'})`);
  console.log(`TTS: ${ttsLabel()} | STT: ${sttAvailable()?'faster-whisper':'unavailable'}`);
});
