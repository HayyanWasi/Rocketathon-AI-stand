export class LocalVoice {
 constructor(avatar,onStatus,sound=null){this.avatar=avatar;this.onStatus=onStatus;this.sound=sound;this.generation=0;this.cache=new Map();this.speed=1;this.serverFailure=null;this.serverAvailable=null;}
 release(){
  const audio=this.audio;this.audio=null;if(audio){audio.onended=null;audio.onerror=null;audio.pause();audio.removeAttribute('src');audio.load();}this.source?.disconnect();this.analyser?.disconnect();this.source=null;this.analyser=null;if(this.url)URL.revokeObjectURL(this.url);this.url=null;
 }
 releaseDevice(cancel=false){
  const utterance=this.utterance,engine=this.synthesis;this.utterance=null;this.synthesis=null;
  if(utterance){utterance.onstart=null;utterance.onend=null;utterance.onerror=null;if(cancel)try{engine?.cancel();}catch{}}
 }
 stop(){this.generation++;this.voiceWaitCancel?.();this.voiceWaitCancel=null;this.abort?.abort();this.abort=null;this.release();this.releaseDevice(true);this.avatar.stop();this.sound?.setVoicing(false);this.onStatus(false);}
 configureServer({tts}={}){
  if(typeof tts!=='string')return;
  this.serverAvailable=Boolean(tts.trim())&&tts.trim().toLowerCase()!=='unavailable';
  if(this.serverAvailable)this.serverFailure=null;
 }
 resetServerFailure(){this.serverFailure=null;this.serverAvailable=null;}
 resetRemoteFailure(){this.resetServerFailure();}
 setSpeed(value){this.speed=Math.max(.75,Math.min(1.25,Number(value)||1));if(this.audio){this.audio.playbackRate=this.speed;this.avatar.setSpeechRate?.(this.speed);}}
 async installedVoices(engine,generation){
  const all=()=>{try{return engine.getVoices();}catch{return [];}};
  const read=()=>all().filter(voice=>voice.localService===true);
  const initial=all();if(initial.length)return initial.filter(voice=>voice.localService===true);
  return new Promise(resolve=>{
   let timer,finished=false;
   const done=voices=>{if(finished)return;finished=true;clearTimeout(timer);engine.removeEventListener?.('voiceschanged',changed);if(this.voiceWaitCancel===cancel)this.voiceWaitCancel=null;resolve(generation===this.generation?voices:[]);};
   const changed=()=>{if(generation!==this.generation)return done([]);const voices=read();if(voices.length)done(voices);};
   const cancel=()=>done([]);this.voiceWaitCancel=cancel;engine.addEventListener?.('voiceschanged',changed);timer=setTimeout(()=>done(read()),1200);changed();
  });
 }
 async deviceFallback(text,generation){
  const engine=globalThis.speechSynthesis,U=globalThis.SpeechSynthesisUtterance;if(!engine||!U)return false;
  const voices=await this.installedVoices(engine,generation);if(generation!==this.generation)return true;if(!voices.length)return false;
  const spokenText=String(text).replace(/<\/?en>/gi,'');
  const urdu=/[\u0600-\u06ff]/.test(spokenText)?voices.find(voice=>voice.lang?.toLowerCase().startsWith('ur')):null;
  const selected=urdu||voices.find(voice=>voice.lang?.toLowerCase()==='en-gb')||voices.find(voice=>voice.lang?.toLowerCase().startsWith('en'))||voices[0];
  const utterance=new U(spokenText);utterance.voice=selected;utterance.lang=selected.lang;utterance.rate=this.speed;utterance.pitch=1;utterance.volume=1;this.utterance=utterance;this.synthesis=engine;
  const current=()=>generation===this.generation&&utterance===this.utterance;
  const finish=error=>{if(!current())return;this.releaseDevice();this.avatar.stop();this.sound?.setVoicing(false);this.onStatus(false,error||null);};
  utterance.onstart=()=>{if(!current())return;this.sound?.setVoicing(true);this.avatar.setSpeaking(true,Math.max(5,spokenText.trim().split(/\s+/).length/2.2)/utterance.rate);this.avatar.setSpeechRate?.(utterance.rate);this.onStatus(true,null,'device','Local server voice unavailable; using this device’s voice.');};
  utterance.onend=()=>finish();utterance.onerror=()=>finish('This device could not speak the lesson. Your text is still available; try Read aloud again.');
  try{engine.speak(utterance);return true;}catch{this.releaseDevice(true);return false;}
 }
 async speak(text,{fallbackText}={}){
  text=String(text??'').trim().slice(0,1800);const deviceText=(typeof fallbackText==='string'&&fallbackText.trim()?fallbackText:text).slice(0,1800);
  this.stop();if(!text){this.onStatus(false,'Ask a question before reading a lesson aloud.');return;}const generation=this.generation;this.abort=new AbortController();this.onStatus(true,null,'preparing');
  try{
   let blob=this.cache.get(text);
   if(!blob){
    if(this.serverAvailable===false||this.serverFailure){const failure=Error(this.serverFailure||'Local server speech is unavailable. Your text lesson is still available; check voice setup in Settings.');failure.ttsFailure=true;throw failure;}
    try{
     const r=await fetch('/api/tts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text}),signal:this.abort.signal});
     if(!r.ok){let detail;try{detail=await r.json();}catch{}throw Error(typeof detail?.error==='string'?detail.error:'Spoken answer unavailable.');}
     blob=await r.blob();if(!blob.size)throw Error('The local speech server returned empty audio.');
    }catch(error){error.ttsFailure=true;throw error;}
    if(generation!==this.generation)return;
    if(blob.size<4e6){this.cache.set(text,blob);while(this.cache.size>3)this.cache.delete(this.cache.keys().next().value);}
   }
   if(generation!==this.generation)return;
   this.url=URL.createObjectURL(blob);const audio=this.audio=new Audio(this.url);audio.playbackRate=this.speed;audio.preservesPitch=true;
   if(this.sound){await this.sound.unlock();this.context=this.sound.context;}else{try{const C=globalThis.AudioContext||globalThis.webkitAudioContext;if(C){this.context??=new C();if(this.context.state==='suspended')await this.context.resume();}}catch{this.context=null;}}
   if(generation!==this.generation)return;
   if(this.context?.state==='running'){this.source=this.context.createMediaElementSource(audio);this.analyser=this.context.createAnalyser();this.analyser.fftSize=256;this.source.connect(this.analyser);this.analyser.connect(this.context.destination);}
   const finish=error=>{if(generation!==this.generation||audio!==this.audio)return;this.release();this.avatar.stop();this.sound?.setVoicing(false);this.onStatus(false,error||null);};
   audio.onended=()=>finish();audio.onerror=()=>finish('The spoken answer could not play. Your text lesson is still available.');
   await audio.play();if(generation!==this.generation||audio!==this.audio){audio.pause();return;}
   this.sound?.setVoicing(true);this.avatar.setSpeaking(true,(Number.isFinite(audio.duration)?audio.duration:45)/this.speed);this.avatar.setSpeechRate?.(this.speed);this.onStatus(true,null,'playing');
   const values=this.analyser?new Uint8Array(this.analyser.frequencyBinCount):null;
   const animate=()=>{if(generation!==this.generation||audio!==this.audio||audio.paused)return;if(values&&this.analyser){this.analyser.getByteFrequencyData(values);this.avatar.setLevel(Math.min(1,values.reduce((a,b)=>a+b,0)/values.length/65));}requestAnimationFrame(animate);};animate();
  }catch(error){
   if(error.name==='AbortError'||generation!==this.generation)return;
   this.release();this.avatar.stop();this.sound?.setVoicing(false);
   if(error.ttsFailure){
    if(/espeak-ng.*(?:enoent|not found|not installed|unavailable|failed)|speech.*unavailable|tts.*unavailable/i.test(error.message))this.serverFailure=error.message;
    try{if(await this.deviceFallback(deviceText,generation))return;}catch{}
   }
   if(generation===this.generation)this.onStatus(false,error.message);
  }
 }
 dispose(){this.stop();this.cache.clear();if(!this.sound)this.context?.close();}
}

export class LocalMicrophone {
 constructor(){this.generation=0;this.samples=[];this.sampleCount=0;}
 async start(){
  this.cancel();const generation=this.generation;
  let stream,context,source,processor;
  const superseded=()=>generation!==this.generation;
  const aborted=()=>new DOMException('Microphone recording was cancelled.','AbortError');
  try{
   if(!navigator.mediaDevices?.getUserMedia)throw Error('Microphone input is unavailable here. Type your question instead.');
   stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
   if(superseded()){stream.getTracks().forEach(track=>track.stop());throw aborted();}
   this.stream=stream;const C=globalThis.AudioContext||globalThis.webkitAudioContext;
   if(!C)throw Error('Audio recording is unavailable here. Type your question instead.');
   context=new C();this.context=context;this.samples=[];this.sampleCount=0;
   if(context.state==='suspended')await context.resume();
   if(superseded())throw aborted();
   source=context.createMediaStreamSource(stream);this.source=source;processor=context.createScriptProcessor(4096,1,1);this.processor=processor;
   processor.onaudioprocess=event=>{
    if(superseded()||this.context!==context)return;
    const channel=event.inputBuffer.getChannelData(0),remaining=Math.max(0,context.sampleRate*60-this.sampleCount);
    if(remaining){const copy=new Float32Array(channel.subarray(0,remaining));this.samples.push(copy);this.sampleCount+=copy.length;}
    // The processor is connected only to keep capture active; never echo the microphone.
    event.outputBuffer?.getChannelData(0).fill(0);
   };
   source.connect(processor);processor.connect(context.destination);
  }catch(error){
   if(!superseded())await this.cancel();
   else{try{processor?.disconnect();source?.disconnect();stream?.getTracks().forEach(track=>track.stop());if(context&&context.state!=='closed')await context.close();}catch{}}
   throw error;
  }
 }
 cancel(){
  this.generation++;const context=this.context,stream=this.stream,processor=this.processor,source=this.source;
  this.context=null;this.stream=null;this.processor=null;this.source=null;this.samples=[];this.sampleCount=0;
  if(processor)processor.onaudioprocess=null;
  try{processor?.disconnect();}catch{}try{source?.disconnect();}catch{}
  stream?.getTracks().forEach(track=>{try{track.stop();}catch{}});
  try{return Promise.resolve(context?.close()).catch(()=>{});}catch{return Promise.resolve();}
 }
 async stop(){
  const samples=this.samples,rate=this.context?.sampleRate||48000,total=samples.reduce((sum,part)=>sum+part.length,0),input=new Float32Array(total);
  let offset=0;for(const part of samples){input.set(part,offset);offset+=part.length;}
  await this.cancel();return LocalMicrophone.encodeWav(input,rate);
 }
 dispose(){return this.cancel();}
 static encodeWav(input,rate){
  const target=16000,ratio=rate/target,length=Math.floor(input.length/ratio),buffer=new ArrayBuffer(44+length*2),view=new DataView(buffer);
  const write=(offset,text)=>[...text].forEach((character,index)=>view.setUint8(offset+index,character.charCodeAt(0)));
  write(0,'RIFF');view.setUint32(4,36+length*2,true);write(8,'WAVE');write(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,target,true);view.setUint32(28,target*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,length*2,true);
  for(let index=0;index<length;index++){
   let value=0;
   if(ratio>=1){
    // Average every input interval, including fractional edges at 44.1 kHz.
    // This avoids nearest-neighbour aliasing when reducing to the STT rate.
    const start=index*ratio,end=Math.min(input.length,(index+1)*ratio);
    for(let sample=Math.floor(start);sample<Math.ceil(end);sample++)value+=input[sample]*(Math.min(end,sample+1)-Math.max(start,sample));
    value/=end-start;
   }else{
    const position=index*ratio,left=Math.floor(position),mix=position-left;
    value=input[left]*(1-mix)+(input[Math.min(left+1,input.length-1)]||0)*mix;
   }
   value=Number.isFinite(value)?Math.max(-1,Math.min(1,value)):0;
   view.setInt16(44+index*2,Math.round(value*(value<0?32768:32767)),true);
  }
  return new Blob([buffer],{type:'audio/wav'});
 }
}
