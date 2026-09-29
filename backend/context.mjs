import fs from 'node:fs/promises';
const root=new URL('../',import.meta.url);
export const readJSON=async(name)=>JSON.parse(await fs.readFile(new URL(name,root),'utf8'));
export async function loadBase(){const [persona,index]=await Promise.all([fs.readFile(new URL('backend/persona.md',root),'utf8'),readJSON('backend/syllabus/index.json')]);return {persona,index};}
export function selectTopic(question,index){const q=question.toLowerCase();const matches=index.topics.map(t=>({topic:t,score:t.keywords.reduce((n,w)=>n+(q.includes(w)?1:0),0)})).sort((a,b)=>b.score-a.score);return matches[0]?.score?matches[0].topic:null;}
export async function loadTopic(topic){if(!topic)return null;if(!/^data\/[a-z-]+\.json$/.test(topic.file))throw Error('Invalid syllabus path');return readJSON(topic.file);}
