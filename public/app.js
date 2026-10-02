import {TeacherAvatar} from './avatar.js';
import {Blackboard} from './board.js';
import {LocalVoice,LocalMicrophone} from './voice.js';
import {ClassroomSound} from './sound.js';
import {SessionNotebook} from './notebook.js';
import {normalizeLessonText} from './lesson-text.js';
import {normalizeLibrary,normalizeLesson} from './api-contract.js';
import {buildLessonQuestion} from './request-context.js';
import {TeacherCall} from './call/call.js';
const $=s=>document.querySelector(s), el=(tag,text)=>{const x=document.createElement(tag);x.textContent=text;return x;};
const icons={volume:'<path d="M11 4 6 8H3v8h3l5 4zM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>',pause:'<path d="M9 5v14M15 5v14"/>',play:'<path d="m8 5 11 7-11 7z"/>',mic:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',send:'<path d="m4 4 17 8-17 8 4-8zM8 12h13"/>'};
const icon=n=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+icons[n]+'</svg>';
document.querySelectorAll('[data-icon]').forEach(n=>n.innerHTML=icon(n.dataset.icon));
let timer;
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(timer);timer=setTimeout(()=>$('#toast').hidden=true,6000);}
async function api(path,options={}){const r=await fetch(path,options),d=await r.json();if(!r.ok)throw Error(d.error||'Request failed');return d;}
const post=(path,data,signal)=>api(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal});
// Storage failures (private mode, quota) must never block a lesson.
const storage={getItem(k){try{return localStorage.getItem(k);}catch{return null;}},setItem(k,v){try{localStorage.setItem(k,v);}catch{}},removeItem(k){try{localStorage.removeItem(k);}catch{}}};
// The server owns one shared device profile. Browser notes are a UI cache only.
const notebookId='device';
let libraryPromise=null;
function loadLibrary(){return libraryPromise??=api('/api/library').then(normalizeLibrary).catch(error=>{libraryPromise=null;throw error;});}
let savedPrefs={};try{savedPrefs=JSON.parse(storage.getItem('mahad-classroom-prefs')||'{}')||{};}catch{}
const prefs={effects:savedPrefs.effects!==false,ambient:savedPrefs.ambient===true,volume:Number.isFinite(savedPrefs.volume)?Math.max(0,Math.min(1,savedPrefs.volume)):.35,speed:[.85,1,1.15].includes(savedPrefs.speed)?savedPrefs.speed:1,autoBoard:savedPrefs.autoBoard!==false};
const sound=new ClassroomSound(prefs),avatar=new TeacherAvatar($('#avatar')),board=new Blackboard(),mic=new LocalMicrophone(),notebook=new SessionNotebook(storage,notebookId);
let autoVoice=storage.getItem('mahad-voice')==='true',history=[],latest=null,currentQuestion='',controller=null,requestVersion=0,recording=false,startingMic=false,transcribing=false,resetting=false,recordTimer,micVersion=0,boardFocused=false,focusTranscriptExpanded=null,walkSide=false,answeringCheck=false,call=null,inCall=false;
const voice=new LocalVoice(avatar,(active,error,phase,notice)=>{
 $('#stop-speaking').hidden=!active;$('#stop-speaking').textContent=phase==='preparing'?'Cancel voice':phase==='device'?'Stop device voice':'Stop voice';
 $('#teacher-stage').dataset.voice=active?phase:(error?'error':'idle');
 if(error){$('#read-answer').textContent='Retry read aloud';$('#read-answer').title=error;toast(error);}else if(active){$('#read-answer').innerHTML=icon('volume')+' Read aloud';$('#read-answer').title='';}
 if(notice)toast(notice);
},sound);
voice.setSpeed(prefs.speed);
avatar.onFootstep=event=>sound.footstep(event);
avatar.onBoardStep=({step,total})=>{document.querySelectorAll('#board-steps li').forEach((li,i)=>li.classList.toggle('current-step',i===step));const data=avatar.boardData;$('#avatar').setAttribute('aria-label',normalizeLessonText('3D classroom. Blackboard: '+data.title+'. Step '+(step+1)+' of '+total+'. '+(data.steps[step]||'')+(data.equation?' Equation: '+data.equation:'')));};
board.onChange=data=>{avatar.setBoard(data);avatar.setAutoBoard(prefs.autoBoard);if(!data)$('#avatar').setAttribute('aria-label','3D classroom viewed from a front-row student desk');};
const persist=()=>notebook.save({latest,currentQuestion,history});
function inputHint(){return answeringCheck?'Your answer to the check · Enter to send':'Enter to send';}
function checkMode(value){answeringCheck=value;$('#question').placeholder=value?'Your answer to the check…':'Sir, ek question hai…';$('#answer-check').textContent=value?'Cancel check answer':'Answer check';$('#input-status').textContent=inputHint();}
async function speakLesson(data){const fallbackText=normalizeLessonText(data.answer+' '+(data.check?.question||''));const speech=[data.speech_text||data.answer,data.check?.speech||data.check?.question].filter(Boolean).join(' ');if(await sayInCall(speech))return;voice.speak(speech,{fallbackText});}
function updatePrefs(){storage.setItem('mahad-classroom-prefs',JSON.stringify(prefs));sound.configure({effects:prefs.effects,ambient:prefs.ambient,volume:prefs.volume});voice.setSpeed(prefs.speed);avatar.setAutoBoard(prefs.autoBoard);}
$('#sound-effects').checked=prefs.effects;$('#room-ambient').checked=prefs.ambient;$('#sound-volume').value=prefs.volume*100;$('#speech-speed').value=String(prefs.speed);$('#auto-board').checked=prefs.autoBoard;
$('#sound-effects').onchange=e=>{prefs.effects=e.target.checked;updatePrefs();};
$('#room-ambient').onchange=e=>{prefs.ambient=e.target.checked;updatePrefs();};
$('#sound-volume').oninput=e=>{prefs.volume=Number(e.target.value)/100;updatePrefs();};
$('#speech-speed').onchange=e=>{prefs.speed=Number(e.target.value);updatePrefs();};
$('#auto-board').onchange=e=>{prefs.autoBoard=e.target.checked;updatePrefs();};
// Unlock once in a real gesture, before async requests. Nothing autoplays on reload.
document.addEventListener('pointerdown',()=>sound.unlock(),{passive:true});
document.addEventListener('keydown',()=>sound.unlock(),{passive:true});
function preference(v){autoVoice=v;storage.setItem('mahad-voice',String(v));$('#voice-toggle').setAttribute('aria-pressed',v);$('#voice-toggle').setAttribute('aria-label',v?'Turn spoken answers off':'Turn spoken answers on');if(!v)voice.stop();}
preference(autoVoice);
$('#voice-toggle').onclick=()=>preference(!autoVoice);$('#stop-speaking').onclick=()=>{voice.stop();call?.stopSpeaking();};
function syncMotionButton(){$('#motion-toggle').innerHTML=icon(avatar.motion?'pause':'play');$('#motion-toggle').setAttribute('aria-label',avatar.motion?'Pause teacher animation':'Resume teacher animation');}
syncMotionButton();avatar.motionPreference?.addEventListener('change',syncMotionButton);
$('#motion-toggle').onclick=()=>{avatar.setMotion(!avatar.motion);syncMotionButton();};
function collapseTranscript(value){$('.lesson').classList.toggle('collapsed',value);$('#toggle-transcript').setAttribute('aria-expanded',!value);$('#toggle-transcript').textContent=value?'+':'−';}
$('#toggle-transcript').onclick=()=>{const collapsed=!$('.lesson').classList.contains('collapsed');collapseTranscript(collapsed);if(boardFocused)focusTranscriptExpanded=!collapsed;};
function ripple(){if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;const row=$('.input-row');row.classList.remove('ripple');void row.offsetWidth;row.classList.add('ripple');setTimeout(()=>row.classList.remove('ripple'),1400);}
$('#focus-board').onclick=()=>{boardFocused=!boardFocused;if(boardFocused){focusTranscriptExpanded=!$('.lesson').classList.contains('collapsed');collapseTranscript(true);}else{collapseTranscript(!focusTranscriptExpanded);focusTranscriptExpanded=null;}avatar.focusBoard(boardFocused);$('#focus-board').setAttribute('aria-pressed',boardFocused);$('#focus-board').textContent=boardFocused?'Back to your desk ↙':'Focus board ↗';};
function manualBoard(direction){prefs.autoBoard=false;$('#auto-board').checked=false;updatePrefs();direction>0?avatar.nextBoard():avatar.previousBoard();}
$('#next-board').onclick=()=>manualBoard(1);$('#previous-board').onclick=()=>manualBoard(-1);
$('#walk-teacher').onclick=()=>{walkSide=!walkSide;avatar.walkTo(walkSide?1.65:-1.65,-4.9);};
$('#teacher-gesture').onchange=e=>{avatar.gesture(e.target.value);e.target.value='';};
$('#replay-board').onclick=()=>{if(board.data)board.draw(board.data);};
function showDialog(selector){$('#menu').hidden=true;for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();$(selector).showModal();}
document.querySelectorAll('dialog .close').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$('#open-settings').onclick=()=>showDialog('#settings');
$('#more').onclick=()=>$('#menu').hidden=!$('#menu').hidden;
document.addEventListener('click',e=>{if(!$('#menu').contains(e.target)&&!$('#more').contains(e.target))$('#menu').hidden=true;});
async function connection(){
 voice.resetServerFailure?.();callBlocked=false;
 $('#refresh-model').disabled=true;$('#config-status').textContent='Checking connection…';
 try{const d=await api('/api/config');voice.configureServer?.(d);$('#connection-label').textContent=d.available?'Local model connected':'Local model offline';$('#connect').classList.toggle('connected',d.available);$('#config-status').textContent=(d.available?'Teaching model connected: ':'Teaching model unavailable: ')+d.model+'. Server voice: '+d.tts+'. Microphone transcription: '+d.stt+'.'+(!d.available?' '+(d.error||'Start Ollama and load the configured model.'):'');}catch(e){$('#config-status').textContent=e.message;}finally{$('#refresh-model').disabled=false;}
}
$('#connect').onclick=async()=>{showDialog('#settings');await connection();};$('#setup-action').onclick=$('#connect').onclick;$('#refresh-model').onclick=connection;
function busy(value){
 $('#send-button').hidden=value;$('#cancel-answer').hidden=!value;$('#question').disabled=value;$('#mic-button').disabled=value||startingMic||transcribing;$('#hint-check').disabled=value;$('#explain-again').disabled=value;$('#answer-check').disabled=value;
 $('#input-status').textContent=value?'Working through your question…':inputHint();$('#stage-status').textContent=value?'Working through it…':'Ready for your question';$('#board-status').textContent=value?'Preparing the blackboard…':latest?.status==='answer'?'Lecture-backed explanation':latest?.status==='escalate'?'Referred to Sir Mahad.':'A fresh explanation for each question.';
}
function display(data,{restored=false,spoken=false}={}){
 latest=data;$('#answer-panel').hidden=false;$('#lesson-intro').hidden=true;$('#answer-text').textContent=normalizeLessonText(data.answer);$('#citation-links').replaceChildren();$('#understanding').hidden=!data.check;
 $('#read-answer').hidden=data.status!=='answer';$('#explain-again').hidden=data.status!=='answer';$('#save-referral').hidden=data.status!=='escalate';$('#save-referral').disabled=false;$('#save-referral').textContent='Save for Sir Mahad';$('#setup-action').hidden=true;
 if(data.status==='answer'){
  board.draw(data.board);$('#board-status').textContent='Lecture-backed explanation';$('#knowledge-label').textContent='FROM THE LECTURE';
  for(const c of data.citations){const a=el('a',c.time+' · '+c.title);a.href=c.url;a.target='_blank';a.rel='noopener noreferrer';$('#citation-links').append(a);}
  $('#check-question').textContent=normalizeLessonText(data.check.question);$('#check-solution').textContent=normalizeLessonText(data.check.solution);$('#check-solution').hidden=true;$('#reveal-check').hidden=false;
  if(!restored&&!spoken){if(autoVoice||inCall)speakLesson(data);else avatar.startTeaching(Math.max(20,(data.answer+' '+data.check.question).split(/\s+/).length/2.5));}
 }else{board.clear();$('#knowledge-label').textContent='FOR SIR MAHAD';$('#board-status').textContent='Referred to Sir Mahad.';}
 $('#input-status').textContent=inputHint();
}
async function ask(question,{followup=false}={}){
 question=question.trim();
 if(controller||resetting||recording||startingMic||transcribing||!question)return;
 if(question.length>1200){toast('Keep your question under 1,200 characters.');return;}
 let requestQuestion;try{requestQuestion=buildLessonQuestion(question,latest,currentQuestion,{followup,answerCheck:answeringCheck});}catch(error){toast(error.message);return;}
 ripple();sound.cue('send');voice.stop();call?.stopSpeaking();currentQuestion=question;
 const ownController=new AbortController(),version=++requestVersion;controller=ownController;busy(true);$('#question').value='';$('#question').style.height='auto';
 const timeout=setTimeout(()=>{if(version===requestVersion){ownController.abort();toast('The local model took too long. Check the connection in Settings, then retry.');}},125000);
 try{const payload=await post('/api/chat',{question:requestQuestion},ownController.signal);const data=normalizeLesson(payload,payload.status==='answer'?await loadLibrary():null);if(version!==requestVersion||ownController.signal.aborted)return;
  checkMode(false);
  history.push({role:'user',content:question},{role:'assistant',content:normalizeLessonText(data.answer)});history=history.slice(-8);display(data);persist();
 }catch(e){if(version===requestVersion&&e.name!=='AbortError'){toast(e.message);$('#question').value=question;}}
 finally{clearTimeout(timeout);if(version===requestVersion&&controller===ownController){controller=null;busy(false);$('#question').focus();}}
}
$('#question-form').onsubmit=e=>{e.preventDefault();ask($('#question').value);};
$('#question').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('#question-form').requestSubmit();}};
$('#question').oninput=()=>{$('#question').style.height='auto';$('#question').style.height=Math.min($('#question').scrollHeight,90)+'px';};
$('#cancel-answer').onclick=()=>{requestVersion++;controller?.abort();controller=null;voice.stop();busy(false);$('#question').value=currentQuestion;$('#question').focus();};
$('#read-answer').onclick=()=>{if(latest?.check)speakLesson(latest);};
$('#answer-check').onclick=()=>{checkMode(!answeringCheck);$('#question').focus();};
$('#reveal-check').onclick=()=>{$('#check-solution').hidden=false;$('#reveal-check').hidden=true;};
$('#hint-check').onclick=()=>{if(latest?.check){checkMode(false);ask('Give me a small hint for this check, without revealing its final answer: '+latest.check.question,{followup:true});}};
$('#explain-again').onclick=()=>{checkMode(false);ask('Explain it differently using one simple example from the lecture.',{followup:true});};
async function cancelMic(){micVersion++;clearTimeout(recordTimer);recording=false;startingMic=false;transcribing=false;await mic.cancel?.();sound.setRecording(false);$('#mic-button').classList.remove('recording');$('#mic-button').setAttribute('aria-label','Record a question');}
$('#new-session').onclick=async()=>{
 if(resetting)return;resetting=true;requestVersion++;controller?.abort();controller=null;voice.stop();busy(true);await cancelMic();history=[];latest=null;currentQuestion='';checkMode(false);notebook.clear();board.clear();$('#answer-panel').hidden=true;$('#lesson-intro').hidden=false;$('#menu').hidden=true;$('#question').value='';$('#settings').close();
 try{await post('/api/session',{});}catch(e){toast(e.message);}finally{resetting=false;busy(false);$('#question').focus();}
};
$('#save-referral').onclick=async()=>{const question=currentQuestion,reason=latest?.reason;try{await post('/api/escalations',{question,reason});if(currentQuestion===question&&latest?.reason===reason){$('#save-referral').textContent='Saved locally for review';$('#save-referral').disabled=true;}}catch(e){toast(e.message);}};
$('#show-sources').onclick=async()=>{try{const d=await loadLibrary(),box=$('#source-content');box.replaceChildren(el('p',d.source.title));for(const p of d.passages){const card=el('article','');card.className='source-card';const a=el('a',p.time+' · '+p.title);a.href=p.url;a.target='_blank';a.rel='noopener noreferrer';card.append(a,el('p',normalizeLessonText(p.text)));box.append(card);}showDialog('#sources');}catch(e){toast(e.message);}};
$('#show-review').onclick=async()=>{try{const d=await api('/api/escalations'),box=$('#review-content');box.replaceChildren();if(!d.length)box.append(el('p','No questions saved yet.'));else{const exportBtn=el('button','Export for Sir Mahad');exportBtn.className='outline-button';exportBtn.onclick=()=>{const u=URL.createObjectURL(new Blob([JSON.stringify(d,null,2)],{type:'application/json'})),a=el('a','');a.href=u;a.download='sir-mahad-review.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);};box.append(exportBtn);for(const q of d){const c=el('article','');c.className='source-card';c.append(el('strong',q.question),el('p',q.reason.replaceAll('_',' ')));box.append(c);}}showDialog('#review');}catch(e){toast(e.message);}};
$('#show-history').onclick=()=>{const box=$('#history-content');box.replaceChildren();if(!history.length)box.append(el('p','Your conversation will appear here.'));for(const m of history){const item=el('div','');item.className='history-message';item.append(el('small',m.role==='user'?'YOU':'AI STAND-IN'),el('span',m.content));box.append(item);}showDialog('#history');};
for(const [from,to] of [['#source-shortcut','#show-sources'],['#conversation-shortcut','#show-history'],['#settings-history','#show-history'],['#settings-sources','#show-sources'],['#settings-review','#show-review'],['#settings-new','#new-session']])$(from).onclick=()=>$(to).click();
async function finishRecording(){
 if(!recording)return;const version=micVersion;recording=false;transcribing=true;clearTimeout(recordTimer);$('#mic-button').classList.remove('recording');$('#mic-button').disabled=true;$('#mic-button').setAttribute('aria-label','Record a question');$('#input-status').textContent='Transcribing…';
 try{const wav=await mic.stop();sound.setRecording(false);const r=await fetch('/api/transcribe',{method:'POST',headers:{'Content-Type':'audio/wav'},body:wav}),d=await r.json();if(version!==micVersion)return;if(!r.ok)throw Error(d.error);if(!d.text)throw Error('No words recognized. Try again or type your question.');$('#question').value=d.text.slice(0,1200);$('#question').focus();
 }catch(e){if(version===micVersion)toast(e.message);}finally{sound.setRecording(false);if(version===micVersion){transcribing=false;$('#mic-button').disabled=!!controller;$('#input-status').textContent='Check the transcript, then send.';}}
}
$('#mic-button').onclick=async()=>{
 if(inCall){toast('Sir is already listening. Just speak.');return;}
 if(recording)return finishRecording();if(startingMic||transcribing||controller||resetting)return;
 const version=++micVersion;startingMic=true;$('#mic-button').disabled=true;voice.stop();sound.setRecording(true);
 try{await mic.start();if(version!==micVersion)return;recording=true;$('#mic-button').classList.add('recording');$('#mic-button').setAttribute('aria-label','Finish recording');$('#input-status').textContent='Listening… tap the mic to finish';recordTimer=setTimeout(finishRecording,20000);
 }catch(e){sound.setRecording(false);if(version===micVersion)toast(e.message);}finally{if(version===micVersion){startingMic=false;$('#mic-button').disabled=false;}}
};
document.addEventListener('visibilitychange',()=>{sound.setHidden(document.hidden);if(document.hidden&&(recording||startingMic)){cancelMic();$('#input-status').textContent=inputHint();}});
window.addEventListener('pagehide',event=>{requestVersion++;call?.hangup();controller?.abort();controller=null;voice.stop();cancelMic();sound.setHidden(true);if(!event.persisted){voice.dispose();sound.dispose();avatar.dispose();}});
window.addEventListener('pageshow',event=>{sound.setHidden(document.hidden);if(event.persisted)busy(false);});

// Hands-free call (voice-service /ws/call): the student just talks; Sir listens, thinks, answers aloud.
const callStatus={listening:'Sun raha hoon… boliye, beta',thinking:'Soch raha hoon…',speaking:'Explaining it…'};
function callUi(state){
  const b=$('#call-button');b.dataset.state=state;b.textContent=state==='off'?'Call Sir':'End call';b.setAttribute('aria-pressed',String(state!=='off'));
  avatar.setSpeaking(state==='speaking');  // sets its own status text, so ours goes after it
  if(callStatus[state])$('#stage-status').textContent=callStatus[state];
  $('#stop-speaking').hidden=state!=='speaking';
  if(state==='thinking')$('#board-status').textContent='Preparing the blackboard…';
}
// Whenever Sir speaks he also listens, so the student can cut in (barge-in) mid-sentence.
// If the call can't start (mic blocked, voice service down) answers use the old player, without barge-in.
let callStarting=null,callBlocked=false;
async function sayInCall(text){
  if(!text||callBlocked)return false;
  if(!inCall&&!await startCall())return false;
  voice.stop();call.say(text);return true;
}
function startCall(){
  if(inCall)return Promise.resolve(true);
  return callStarting??=openCall().finally(()=>{callStarting=null;});
}
async function openCall(){
  voice.stop();await cancelMic();
  call=new TeacherCall({
    onState:s=>{callUi(s);if(s==='off'&&inCall)endCall();},
    onLevel:l=>avatar.setLevel(l),
    onUserSpeaking:on=>{if(on)$('#stage-status').textContent='Aap bol rahe hain…';},
    onInterrupted:()=>{avatar.setSpeaking(false);$('#stage-status').textContent='Haan beta, boliye…';},
    onHeard:text=>{currentQuestion=text;history.push({role:'user',content:text});$('#input-status').textContent='Aap ne kaha: '+text;},
    onLesson:async lesson=>{try{const data=normalizeLesson(lesson,lesson.status==='answer'?await loadLibrary():null);history.push({role:'assistant',content:normalizeLessonText(data.answer)});history=history.slice(-8);display(data,{spoken:true});persist();}catch(e){toast(e.message);}},
    onError:msg=>toast(msg),
    onMetrics:m=>console.info('[call] stt',m.stt_ms,'ms · llm',m.llm_ms,'ms · first audio',m.first_audio_ms,'ms after you stopped',m),
  });
  try{await call.start();inCall=true;callBlocked=false;return true;}
  catch(e){toast(e.message);callBlocked=true;const c=call;call=null;await c.hangup();callUi('off');return false;}
}
async function endCall(){
  const c=call;call=null;inCall=false;await c?.hangup();
  callUi('off');avatar.stop();$('#input-status').textContent=inputHint();
}
$('#call-button').onclick=()=>{if(inCall)return endCall();callBlocked=false;startCall();};
const restored=notebook.load();if(restored){history=restored.history;currentQuestion=restored.currentQuestion;display(restored.latest,{restored:true});}
connection();
