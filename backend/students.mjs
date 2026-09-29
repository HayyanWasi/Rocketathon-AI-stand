import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../runtime/students');
export function studentId(value){if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{8,80}$/.test(value))throw Error('Invalid student ID');return value;}
export async function loadStudent(id){id=studentId(id);try{return JSON.parse(await fs.readFile(path.join(dir,id+'.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;return {id,history:[],lastTopic:null,preferences:{},updatedAt:null};}}
export async function saveStudent(data){studentId(data.id);await fs.mkdir(dir,{recursive:true});const clean={id:data.id,history:(data.history||[]).slice(-8).map(m=>({role:m.role,content:String(m.content).slice(0,1400)})),lastTopic:data.lastTopic||null,preferences:data.preferences||{},updatedAt:new Date().toISOString()};await fs.writeFile(path.join(dir,data.id+'.json'),JSON.stringify(clean,null,2));return clean;}
export async function clearStudentSession(id){const student=await loadStudent(id);student.history=[];student.lastTopic=null;return saveStudent(student);}
