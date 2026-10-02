// Frontend boundary for the backend's response shape. No network calls or code execution.
const record=value=>Boolean(value&&typeof value==='object'&&!Array.isArray(value));
const text=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
const idPattern=/^[A-Za-z0-9_-]{1,80}$/;
const videoPattern=/^[A-Za-z0-9_-]{11}$/;
const fail=message=>{throw Error('Invalid lesson response: '+message);};
function videoId(source){
  if(videoPattern.test(source?.videoId||''))return source.videoId;
  try{
    const url=new URL(source?.url||'');
    if(url.protocol!=='https:')return null;
    const id=['youtube.com','www.youtube.com','m.youtube.com'].includes(url.hostname)&&url.pathname==='/watch'
      ?url.searchParams.get('v'):url.hostname==='youtu.be'?url.pathname.slice(1):null;
    return videoPattern.test(id||'')?id:null;
  }catch{return null;}
}
function timestamp(seconds){
  const total=Math.floor(seconds),hours=Math.floor(total/3600),minutes=Math.floor(total%3600/60),secs=total%60;
  return hours?`${hours}:${String(minutes).padStart(2,'0')}:${String(secs).padStart(2,'0')}`:`${minutes}:${String(secs).padStart(2,'0')}`;
}
export function normalizeLibrary(payload){
  if(!record(payload))throw Error('Invalid lecture library response.');
  const corpus=Array.isArray(payload.passages)?payload:record(payload.passages)?payload.passages:null;
  if(!corpus||!Array.isArray(corpus.passages))throw Error('Invalid lecture library: passages are missing.');
  const sourceId=videoId(corpus.source);
  if(!sourceId)throw Error('Invalid lecture library: a verified YouTube video is missing.');
  const source={videoId:sourceId,url:`https://www.youtube.com/watch?v=${sourceId}`,title:text(corpus.source?.title,240)||'Physics lecture',channel:text(corpus.source?.channel,120)};
  const seen=new Set();
  const passages=corpus.passages.map(p=>{
    if(!record(p)||typeof p.id!=='string'||!idPattern.test(p.id)||seen.has(p.id))throw Error('Invalid lecture library: passage IDs must be unique.');
    if(!Number.isFinite(p.start)||p.start<0||p.start>31536000)throw Error('Invalid lecture library: passage timestamp is missing.');
    const title=text(p.title,180),body=text(p.text,4000);
    if(!title||!body)throw Error('Invalid lecture library: a passage has no title or text.');
    seen.add(p.id);
    const start=Math.floor(p.start);
    return {id:p.id,title,text:body,start,time:timestamp(start),url:`${source.url}&t=${start}s`,conflict:p.conflict===true};
  });
  return {source,passages,index:record(payload.index)?payload.index:null};
}
const ranges={x:[0,100],y:[0,100],x2:[0,100],y2:[0,100],radius:[0,70],startAngle:[-360,360],endAngle:[-360,360]};
const required={line:['x','y','x2','y2'],arrow:['x','y','x2','y2'],circle:['x','y','radius'],arc:['x','y','radius','startAngle','endAngle'],text:['x','y']};
function diagramPrimitive(p){
  if(!record(p)||!Object.hasOwn(required,p.type)||required[p.type].some(key=>!Number.isFinite(p[key])))return null;
  const result={type:p.type};
  for(const key of required[p.type]){const [minimum,maximum]=ranges[key];result[key]=Math.max(minimum,Math.min(maximum,p[key]));}
  if(p.type==='text'){result.text=text(p.text,60);if(!result.text)return null;}
  return result;
}
export function normalizeLesson(payload,library){
  if(!record(payload))fail('expected a lesson object.');
  if(!['answer','escalate'].includes(payload.status))fail('unsupported status '+JSON.stringify(text(payload.status,40)||'(missing)')+'.');
  const answer=text(payload.answer,1400);
  if(!answer)fail('the explanation is missing.');
  const base={id:text(payload.id,100),status:payload.status,answer,speech_text:text(payload.speech_text,1400)||answer,provider:text(payload.provider,80)};
  if(payload.status==='escalate')return {...base,reason:text(payload.reason,60)||'insufficient_source',citations:[],check:null,board:null,knowledgeMode:'lecture'};
  if(!Array.isArray(payload.citations))fail('citations must be an array.');
  const mode=payload.knowledgeMode==='general'?'general':'lecture';
  if(mode==='lecture'&&!payload.citations.length)fail('a lecture answer needs a verified passage.');
  if(mode==='general'&&payload.citations.length)fail('a general explanation cannot claim lecture citations.');
  const corpus=payload.citations.length?normalizeLibrary(library):null;
  const byId=new Map(corpus?.passages.map(p=>[p.id,p])||[]),seen=new Set(),citations=[];
  for(const c of payload.citations){
    if(!record(c)||typeof c.id!=='string'||!byId.has(c.id))fail('an unknown passage was cited.');
    const passage=byId.get(c.id);
    if(passage.conflict)fail('the cited passage is marked conflicting.');
    if(seen.has(c.id))continue;
    seen.add(c.id);
    citations.push({id:passage.id,title:passage.title,start:passage.start,time:passage.time,url:passage.url,excerpt:passage.text});
    if(citations.length>4)fail('too many lecture citations.');
  }
  if(!record(payload.check)||!text(payload.check.question,300)||!text(payload.check.solution,400))fail('the understanding check is incomplete.');
  if(!record(payload.board)||!Array.isArray(payload.board.steps))fail('blackboard notes are missing.');
  const board={title:text(payload.board.title,100),steps:payload.board.steps.slice(0,4).map(s=>text(s,180)).filter(Boolean),equation:text(payload.board.equation,120),diagram:(Array.isArray(payload.board.diagram)?payload.board.diagram:[]).slice(0,30).map(diagramPrimitive).filter(Boolean)};
  if(!board.title||(!board.steps.length&&!board.equation&&!board.diagram.length))fail('the blackboard explanation is empty.');
  return {...base,citations,check:{question:text(payload.check.question,300),solution:text(payload.check.solution,400),speech:text(payload.check.speech,400)||text(payload.check.question,300)},board,knowledgeMode:mode};
}
