// Bounded browser notebook cache. Server student memory is managed separately.
const text=(v,n)=>typeof v==='string'?v.slice(0,n):'';
const types=new Set(['line','arrow','circle','arc','text']);
function safeLesson(value){
 if(!value||!['answer','escalate'].includes(value.status)||!text(value.answer,1400))return null;
 const lesson={status:value.status,answer:text(value.answer,1400),speech_text:text(value.speech_text,1400),reason:text(value.reason,60),knowledgeMode:value.knowledgeMode==='lecture'?'lecture':'general',citations:[],check:null,board:null};
 if(lesson.status==='escalate')return lesson;
 if(!value.board||!Array.isArray(value.board.steps)||!value.check?.question)return null;
 const diagram=(Array.isArray(value.board.diagram)?value.board.diagram:[]).slice(0,30).filter(p=>p&&types.has(p.type)).map(p=>{
  const result={type:p.type,text:text(p.text,60)};
  for(const k of ['x','y','x2','y2','radius','startAngle','endAngle']){const angle=k.endsWith('Angle'),minimum=angle?-360:0,maximum=angle?360:k==='radius'?70:100;result[k]=Number.isFinite(p[k])?Math.max(minimum,Math.min(maximum,p[k])):0;}
  return result;
 });
 lesson.board={title:text(value.board.title,100),steps:value.board.steps.slice(0,4).map(s=>text(s,180)).filter(Boolean),equation:text(value.board.equation,120),diagram};
 lesson.check={question:text(value.check.question,300),solution:text(value.check.solution,400),speech:text(value.check.speech,400)};
 for(const c of (Array.isArray(value.citations)?value.citations:[]).slice(0,4)){
  try{const url=new URL(c.url);if(url.protocol!=='https:'||url.hostname!=='www.youtube.com'||url.pathname!=='/watch'||!url.searchParams.get('v'))continue;
   lesson.citations.push({url:url.href,title:text(c.title,100),time:text(c.time,20)});
  }catch{}
 }
 return lesson;
}
export class SessionNotebook{
 constructor(storage,studentId){this.storage=storage;this.key='mahad-notebook-v1-'+studentId;}
 load(){try{const raw=this.storage.getItem(this.key);if(!raw||raw.length>25000)return null;const data=JSON.parse(raw);if(data.version!==1)return null;
  const latest=safeLesson(data.latest);if(!latest)return null;
  return {latest,currentQuestion:text(data.currentQuestion,1200),history:(Array.isArray(data.history)?data.history:[]).slice(-8).filter(m=>m&&['user','assistant'].includes(m.role)).map(m=>({role:m.role,content:text(m.content,1700)}))};
 }catch{return null;}}
 save(data){try{const latest=safeLesson(data.latest);if(!latest)return false;const history=(Array.isArray(data.history)?data.history:[]).slice(-8).map(m=>({role:m.role,content:text(m.content,1700)}));this.storage.setItem(this.key,JSON.stringify({version:1,latest,currentQuestion:text(data.currentQuestion,1200),history}));return true;}catch{return false;}}
 clear(){try{this.storage.removeItem(this.key);}catch{}}
}
