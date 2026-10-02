import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalVoice,LocalMicrophone} from '../public/voice.js';
import {ClassroomSound} from '../public/sound.js';

class Param {
 constructor(value=0){this.value=value;this.events=[];}
 setValueAtTime(value,time){this.value=value;this.events.push(['set',value,time]);}
 exponentialRampToValueAtTime(value,time){this.value=value;this.events.push(['ramp',value,time]);}
 setTargetAtTime(value,time,constant){this.value=value;this.events.push(['target',value,time,constant]);}
}
class AudioNode {
 constructor(kind){this.kind=kind;this.connections=[];this.disconnections=0;this.gain=new Param();this.frequency=new Param();this.playbackRate=new Param(1);this.pan=new Param();}
 connect(node){this.connections.push(node);return node;}
 disconnect(){this.disconnections++;this.connections=[];}
 start(time=0){this.startedAt=time;}
 stop(time=0){this.stoppedAt=time;this.stops=(this.stops||0)+1;}
 end(){this.onended?.();}
}
class Context {
 static instances=[];
 constructor(){this.state='running';this.sampleRate=48000;this.currentTime=2;this.destination=new AudioNode('destination');this.nodes=[];Context.instances.push(this);}
 node(kind){const node=new AudioNode(kind);this.nodes.push(node);return node;}
 createGain(){return this.node('gain');}
 createBufferSource(){return this.node('buffer');}
 createBiquadFilter(){return this.node('filter');}
 createOscillator(){return this.node('oscillator');}
 createStereoPanner(){return this.node('panner');}
 createMediaElementSource(audio){const node=this.node('media');node.audio=audio;return node;}
 createMediaStreamSource(stream){const node=this.node('microphone');node.stream=stream;return node;}
 createScriptProcessor(){return this.node('processor');}
 createAnalyser(){const node=this.node('analyser');node.frequencyBinCount=128;node.getByteFrequencyData=values=>values.fill(20);return node;}
 createBuffer(channels,length,rate){const data=new Float32Array(length);return {length,sampleRate:rate,getChannelData:()=>data};}
 async resume(){this.state='running';}
 async close(){this.state='closed';this.closed=(this.closed||0)+1;}
}
class MediaAudio {
 static instances=[];
 constructor(url){this.src=url;this.duration=8;this.paused=true;MediaAudio.instances.push(this);}
 async play(){this.paused=false;}
 pause(){this.paused=true;this.pauses=(this.pauses||0)+1;}
 removeAttribute(){this.src='';}
 load(){this.loads=(this.loads||0)+1;}
}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const audioReply=()=>({ok:true,blob:async()=>new Blob(['encoded audio'],{type:'audio/wav'})});
async function environment(overrides,run){
 const saved=new Map(),revoked=[],raf=[];Context.instances=[];MediaAudio.instances=[];let number=0;
 const values={AudioContext:Context,Audio:MediaAudio,fetch:async()=>audioReply(),requestAnimationFrame:callback=>raf.push(callback),URL:{createObjectURL:()=>`blob:test-${++number}`,revokeObjectURL:url=>revoked.push(url)},...overrides};
 for(const [key,value]of Object.entries(values)){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}
 try{await run({revoked,raf});}finally{for(const [key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
}
const avatar=()=>({stops:0,speaking:[],levels:[],stop(){this.stops++;},setSpeaking(...args){this.speaking.push(args);},setLevel(value){this.levels.push(value);}});

test('older voice completion cannot stop the replacement audio; audio graphs and URLs are released',async()=>{
 await environment({},async({revoked})=>{
  const teacher=avatar(),statuses=[],voice=new LocalVoice(teacher,(...status)=>statuses.push(status));
  await voice.speak('First explanation');const first=voice.audio,oldEnd=first.onended,oldSource=voice.source,oldAnalyser=voice.analyser;
  await voice.speak('Replacement explanation');const current=voice.audio,stopCount=teacher.stops;oldEnd();
  assert.equal(voice.audio,current);assert.equal(teacher.stops,stopCount);assert.equal(current.paused,false);
  assert.equal(oldSource.disconnections,1);assert.equal(oldAnalyser.disconnections,1);assert.equal(first.onended,null);assert.equal(first.src,'');
  assert.deepEqual(revoked,['blob:test-1']);current.onended();assert.equal(voice.audio,null);assert.deepEqual(revoked,['blob:test-1','blob:test-2']);assert.equal(statuses.at(-1)[0],false);
  voice.dispose();assert.equal(Context.instances[0].state,'closed');
 });
});

test('a stale delayed TTS response never starts playback or overwrites a newer lesson',async()=>{
 const slow=deferred();let calls=0;
 await environment({fetch:()=>++calls===1?slow.promise:Promise.resolve(audioReply())},async()=>{
  const voice=new LocalVoice(avatar(),()=>{}),first=voice.speak('Old');await voice.speak('New');const current=voice.audio;
  slow.resolve(audioReply());await first;assert.equal(voice.audio,current);assert.equal(MediaAudio.instances.length,1);assert.equal(voice.cache.has('Old'),false);voice.dispose();
 });
});

test('spoken answer replay uses its bounded cache and preserves selected playback speed',async()=>{
 let calls=0;await environment({fetch:async()=>{calls++;return audioReply();}},async()=>{
  const voice=new LocalVoice(avatar(),()=>{});voice.setSpeed(1.2);await voice.speak('Replay me');await voice.speak('Replay me');
  assert.equal(calls,1);assert.equal(voice.audio.playbackRate,1.2);
  for(const text of ['Two','Three','Four'])await voice.speak(text);
  assert.equal(voice.cache.size,3);assert.equal(voice.cache.has('Replay me'),false);voice.setSpeed(10);assert.equal(voice.audio.playbackRate,1.25);voice.dispose();
 });
});

test('audio play failure leaves text usable and cleans the audio graph',async()=>{
 class BlockedAudio extends MediaAudio{async play(){throw Error('Playback was blocked');}}
 await environment({Audio:BlockedAudio},async({revoked})=>{
  const statuses=[],teacher=avatar(),voice=new LocalVoice(teacher,(...status)=>statuses.push(status));await voice.speak('Text remains');
  assert.equal(voice.audio,null);assert.equal(voice.source,null);assert.equal(voice.analyser,null);assert.equal(revoked.length,1);assert.match(statuses.at(-1)[1],/blocked/);voice.dispose();
 });
});

test('room sound obeys preferences, ducks under speech, and stops while recording or hidden',async()=>{
 await environment({},async()=>{
  const sound=new ClassroomSound();assert.equal(sound.ambient,false);await sound.unlock();assert.equal(sound.room,undefined);
  sound.configure({ambient:true,volume:5});assert.equal(sound.volume,1);assert.equal(sound.master.gain.value,1);assert.equal(sound.room.source.loop,true);assert.equal(sound.room.gain.gain.value,.032);
  sound.setVoicing(true);assert.equal(sound.room.gain.gain.value,.009);sound.setVoicing(false);assert.equal(sound.room.gain.gain.value,.032);
  const first=sound.room;sound.setRecording(true);assert.equal(sound.room,null);assert.equal(first.gain.gain.value,0);assert.equal(first.source.stoppedAt,sound.context.currentTime+.6);first.source.end();assert.equal(first.source.disconnections,1);
  const count=sound.context.nodes.length;sound.cue();sound.footstep();assert.equal(sound.context.nodes.length,count);
  sound.setRecording(false);assert.ok(sound.room);const second=sound.room;sound.setHidden(true);assert.equal(sound.room,null);second.source.end();assert.equal(second.filter.disconnections,1);sound.dispose();assert.equal(sound.context.state,'closed');
 });
});

test('send cues and spatial footsteps are short, controllable, and disconnect after completion',async()=>{
 await environment({},async()=>{
  const sound=new ClassroomSound({effects:false});await sound.unlock();sound.cue();assert.equal(sound.nodes.size,0);
  sound.configure({effects:true});sound.cue();assert.equal(sound.nodes.size,1);const cue=[...sound.nodes][0],cueGain=cue.connections[0];
  assert.ok(cue.stoppedAt-cue.startedAt<.2);cue.end();assert.equal(sound.nodes.size,0);assert.equal(cueGain.disconnections,1);
  sound.footstep({side:'left',position:{x:-2}});const left=[...sound.nodes][0],filter=left.connections[0],gain=filter.connections[0],pan=gain.connections[0];
  assert.equal(left.playbackRate.value,.98);assert.ok(pan.pan.value<0);assert.equal(left.buffer.length,7680);assert.ok(gain.gain.events.some(event=>event[1]===.075));
  left.end();assert.equal(filter.disconnections,1);assert.equal(pan.disconnections,1);
  sound.setVoicing(true);sound.footstep({side:'right',position:{x:3}});const right=[...sound.nodes][0];assert.equal(right.playbackRate.value,1.03);assert.ok(right.connections[0].connections[0].gain.events.some(event=>event[1]===.045));
  sound.setHidden(true);assert.ok(right.stops>=1);right.end();assert.equal(sound.nodes.size,0);sound.dispose();
 });
});

test('cancelling a pending microphone permission request closes the late stream without recording',async()=>{
 const permission=deferred(),track={stops:0,stop(){this.stops++;}};
 await environment({navigator:{mediaDevices:{getUserMedia:()=>permission.promise}}},async()=>{
  const mic=new LocalMicrophone(),start=mic.start();await mic.cancel();permission.resolve({getTracks:()=>[track]});
  await assert.rejects(start,{name:'AbortError'});assert.ok(track.stops>=1);assert.equal(mic.stream,null);assert.equal(Context.instances.length,0);
 });
});

test('microphone partial initialization failure stops tracks, disconnects nodes, and closes its context',async()=>{
 class BrokenContext extends Context{createScriptProcessor(){throw Error('Capture processor unavailable');}}
 const track={stops:0,stop(){this.stops++;}};
 await environment({AudioContext:BrokenContext,navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[track]})}}},async()=>{
  const mic=new LocalMicrophone();await assert.rejects(mic.start(),/processor unavailable/);assert.equal(track.stops,1);assert.equal(Context.instances[0].state,'closed');assert.equal(Context.instances[0].nodes[0].disconnections,1);assert.equal(mic.context,null);assert.equal(mic.processor,null);
 });
});

test('microphone capture outputs 16 kHz mono WAV and removes recording resources',async()=>{
 const track={stops:0,stop(){this.stops++;}};
 await environment({navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[track]})}}},async()=>{
  const mic=new LocalMicrophone();await mic.start();const processor=mic.processor,source=mic.source,context=mic.context,output=new Float32Array([1,1,1]);
  processor.onaudioprocess({inputBuffer:{getChannelData:()=>new Float32Array([1,-.5,-.5,-1,-1,-1])},outputBuffer:{getChannelData:()=>output}});
  assert.deepEqual([...output],[0,0,0]);const blob=await mic.stop(),buffer=await blob.arrayBuffer(),view=new DataView(buffer);
  assert.equal(blob.type,'audio/wav');assert.equal(view.getUint32(24,true),16000);assert.equal(view.getUint16(22,true),1);assert.equal(view.getUint32(40,true),4);
  assert.equal(view.getInt16(44,true),0);assert.equal(view.getInt16(46,true),-32768);assert.equal(track.stops,1);assert.equal(context.state,'closed');assert.equal(processor.onaudioprocess,null);assert.equal(source.disconnections,1);
 });
});

test('fractional-rate microphone resampling preserves constant amplitude without NaNs',async()=>{
 const blob=LocalMicrophone.encodeWav(new Float32Array(441).fill(.25),44100),view=new DataView(await blob.arrayBuffer());assert.equal(view.getUint32(40,true),320);
 for(let offset=44;offset<view.byteLength;offset+=2)assert.equal(view.getInt16(offset,true),8192);
 const empty=await new LocalMicrophone().stop();assert.equal(empty.size,44);
});
test('voice falls back to media-element playback if Web Audio could not unlock',async()=>{
 await environment({},async()=>{
  const context=new Context();context.state='suspended';const sound={context,unlock:async()=>false,setVoicing(){}};
  const voice=new LocalVoice(avatar(),()=>{},sound);await voice.speak('Still audible');assert.equal(voice.audio.paused,false);assert.equal(voice.source,null);assert.equal(context.nodes.length,0);voice.dispose();
 });
});

test('an unavailable AudioContext after permission grant still stops the microphone stream',async()=>{
 const track={stops:0,stop(){this.stops++;}};
 await environment({AudioContext:undefined,webkitAudioContext:undefined,navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[track]})}}},async()=>{
  const mic=new LocalMicrophone();await assert.rejects(mic.start(),/Audio recording is unavailable/);assert.equal(track.stops,1);assert.equal(mic.stream,null);
 });
});
test('a cancelled microphone startup cannot tear down a newer recording',async()=>{
 const resume=deferred(),tracks=[{stop(){this.stops=(this.stops||0)+1;}},{stop(){this.stops=(this.stops||0)+1;}}];let requests=0;
 class DelayedContext extends Context{constructor(){super();if(Context.instances.length===1)this.state='suspended';}resume(){return resume.promise;}}
 await environment({AudioContext:DelayedContext,navigator:{mediaDevices:{getUserMedia:async()=>{const track=tracks[requests++];return {getTracks:()=>[track]};}}}},async()=>{
  const mic=new LocalMicrophone(),oldStart=mic.start();await Promise.resolve();await mic.cancel();await mic.start();const current=mic.context;
  resume.resolve();await assert.rejects(oldStart,{name:'AbortError'});assert.equal(mic.context,current);assert.equal(current.state,'running');assert.equal(tracks[1].stops,undefined);assert.ok(mic.processor.onaudioprocess);await mic.dispose();
 });
});
class DeviceUtterance{constructor(text){this.text=text;}}
class DeviceSynth{
 constructor(voices=[]){this.voices=voices;this.listeners=new Set();this.spoken=[];this.cancels=0;}
 getVoices(){return this.voices;}
 addEventListener(name,callback){if(name==='voiceschanged')this.listeners.add(callback);}
 removeEventListener(name,callback){if(name==='voiceschanged')this.listeners.delete(callback);}
 emitVoices(){for(const callback of [...this.listeners])callback();}
 speak(utterance){this.spoken.push(utterance);utterance.onstart?.();}
 cancel(){this.cancels++;}
}
const unavailableReply=()=>({ok:false,json:async()=>({error:'Local speech unavailable: eSpeak NG is not installed. Text remains available.'})});
const localVoice={name:'Installed English',lang:'en-GB',localService:true};

test('unavailable eSpeak server uses only an installed local voice, ducks ambience, and stops on actual end',async()=>{
 const engine=new DeviceSynth([{name:'Remote English',lang:'en-GB',localService:false},{name:'Local US',lang:'en-US',localService:true},localVoice]);let requests=0;
 await environment({speechSynthesis:engine,SpeechSynthesisUtterance:DeviceUtterance,fetch:async()=>{requests++;return unavailableReply();}},async()=>{
  const statuses=[],sound={voicing:false,setVoicing(value){this.voicing=value;}},teacher=avatar(),voice=new LocalVoice(teacher,(...status)=>statuses.push(status),sound);
  voice.setSpeed(.85);await voice.speak('Beta, pehle concept samajho.');const utterance=engine.spoken[0];
  assert.equal(requests,1);assert.equal(utterance.voice,localVoice);assert.equal(utterance.rate,.85);assert.equal(sound.voicing,true);assert.equal(statuses.at(-1)[2],'device');assert.match(statuses.at(-1)[3],/device’s voice/);assert.ok(teacher.speaking.at(-1)[1]>0);
  voice.setSpeed(1.2);assert.equal(utterance.rate,.85,'Active device speech is not restarted or mutated');utterance.onend();assert.equal(sound.voicing,false);assert.equal(voice.utterance,null);assert.equal(statuses.at(-1)[0],false);voice.dispose();
 });
});

test('known missing speech engine is not called again until explicitly reset, and next device utterance uses selected speed',async()=>{
 const engine=new DeviceSynth([localVoice]);let requests=0;
 await environment({speechSynthesis:engine,SpeechSynthesisUtterance:DeviceUtterance,fetch:async()=>{requests++;return unavailableReply();}},async()=>{
  const voice=new LocalVoice(avatar(),()=>{});await voice.speak('First');voice.setSpeed(1.15);await voice.speak('Second');assert.equal(requests,1);assert.equal(engine.spoken[1].rate,1.15);
  voice.resetServerFailure();await voice.speak('Try the installed server voice');assert.equal(requests,2);voice.dispose();
 });
});

test('no installed local voice preserves the original friendly failure and never chooses remote synthesis',async()=>{
 const engine=new DeviceSynth([{name:'Remote only',lang:'en-GB',localService:false}]);
 await environment({speechSynthesis:engine,SpeechSynthesisUtterance:DeviceUtterance,fetch:async()=>unavailableReply()},async()=>{
  const statuses=[],voice=new LocalVoice(avatar(),(...status)=>statuses.push(status));await voice.speak('Text still teaches');assert.equal(engine.spoken.length,0);assert.equal(statuses.at(-1)[0],false);assert.match(statuses.at(-1)[1],/speech unavailable/);voice.dispose();
 });
});

test('delayed installed voices start the fallback once and unregister the loading listener',async()=>{
 const engine=new DeviceSynth();
 await environment({speechSynthesis:engine,SpeechSynthesisUtterance:DeviceUtterance,fetch:async()=>unavailableReply()},async()=>{
  const voice=new LocalVoice(avatar(),()=>{}),play=voice.speak('Waiting for an installed voice');for(let i=0;i<8&&!voice.voiceWaitCancel;i++)await Promise.resolve();assert.equal(engine.listeners.size,1);
  engine.voices=[localVoice];engine.emitVoices();await play;assert.equal(engine.spoken.length,1);assert.equal(engine.listeners.size,0);voice.dispose();
 });
});

test('stopping during voice loading removes listeners and prevents delayed synthesis from starting',async()=>{
 const engine=new DeviceSynth();
 await environment({speechSynthesis:engine,SpeechSynthesisUtterance:DeviceUtterance,fetch:async()=>unavailableReply()},async()=>{
  const voice=new LocalVoice(avatar(),()=>{}),play=voice.speak('Cancel before voices load');for(let i=0;i<8&&!voice.voiceWaitCancel;i++)await Promise.resolve();assert.equal(engine.listeners.size,1);
  voice.stop();engine.voices=[localVoice];engine.emitVoices();await play;assert.equal(engine.spoken.length,0);assert.equal(engine.listeners.size,0);voice.dispose();
 });
});

test('an old cancelled device callback cannot stop the replacement utterance',async()=>{
 const engine=new DeviceSynth([localVoice]);
 await environment({speechSynthesis:engine,SpeechSynthesisUtterance:DeviceUtterance,fetch:async()=>unavailableReply()},async()=>{
  const teacher=avatar(),voice=new LocalVoice(teacher,()=>{});await voice.speak('First');const first=voice.utterance,oldEnd=first.onend;await voice.speak('Second');const current=voice.utterance,stops=teacher.stops;oldEnd();
  assert.equal(voice.utterance,current);assert.equal(teacher.stops,stops);assert.equal(engine.cancels,1);assert.equal(first.onend,null);voice.stop();assert.equal(engine.cancels,2);assert.equal(current.onerror,null);
 });
});

test('health reports unavailable TTS without a failed request; restored availability retries the local WAV server',async()=>{
 const engine=new DeviceSynth([localVoice]);let requests=0;
 await environment({speechSynthesis:engine,SpeechSynthesisUtterance:DeviceUtterance,fetch:async(url,options)=>{requests++;assert.equal(url,'/api/tts');assert.equal(options.method,'POST');return audioReply();}},async()=>{
  const voice=new LocalVoice(avatar(),()=>{});voice.configureServer({tts:'unavailable'});await voice.speak('Use the device voice');assert.equal(requests,0);assert.equal(engine.spoken.length,1);
  voice.configureServer({tts:'eSpeak NG'});await voice.speak('Use the installed server voice');assert.equal(requests,1);assert.ok(voice.audio);assert.equal(voice.cache.get('Use the installed server voice').type,'audio/wav');voice.dispose();
 });
});

test('device fallback strips backend language markers and prefers installed Urdu for Urdu-script speech',async()=>{
 const urdu={name:'Installed Urdu',lang:'ur-PK',localService:true},engine=new DeviceSynth([localVoice,urdu]);
 await environment({speechSynthesis:engine,SpeechSynthesisUtterance:DeviceUtterance},async()=>{
  const voice=new LocalVoice(avatar(),()=>{});voice.configureServer({tts:'unavailable'});await voice.speak('پہلے <en>frequency</en> سمجھو');
  assert.equal(engine.spoken[0].voice,urdu);assert.equal(engine.spoken[0].text,'پہلے frequency سمجھو');voice.dispose();
 });
});

test('server WAV still plays when Web Audio is absent',async()=>{
 await environment({AudioContext:undefined,webkitAudioContext:undefined},async()=>{
  const voice=new LocalVoice(avatar(),()=>{});await voice.speak('An accessible spoken lesson');assert.equal(voice.audio.paused,false);assert.equal(voice.source,null);voice.dispose();
 });
});

test('empty local-server audio falls back without attempting invalid media playback',async()=>{
 const engine=new DeviceSynth([localVoice]);
 await environment({speechSynthesis:engine,SpeechSynthesisUtterance:DeviceUtterance,fetch:async()=>({ok:true,blob:async()=>new Blob([],{type:'audio/wav'})})},async()=>{
  const voice=new LocalVoice(avatar(),()=>{});await voice.speak('Continue locally');assert.equal(engine.spoken.length,1);assert.equal(MediaAudio.instances.length,0);voice.dispose();
 });
});

test('tagged backend speech is posted intact while the fallback uses the Roman Urdu display explanation',async()=>{
 const engine=new DeviceSynth([localVoice]),serverText='یہ <en>frequency</en> ہے۔',displayText='Beta, yeh frequency hai.';let posted;
 await environment({speechSynthesis:engine,SpeechSynthesisUtterance:DeviceUtterance,fetch:async(url,options)=>{posted=JSON.parse(options.body).text;return unavailableReply();}},async()=>{
  const voice=new LocalVoice(avatar(),()=>{});await voice.speak(serverText,{fallbackText:displayText});assert.equal(posted,serverText);assert.equal(engine.spoken[0].text,displayText);assert.equal(engine.spoken[0].voice,localVoice);voice.dispose();
 });
});

test('server speech observes the 1800-character backend request limit',async()=>{
 let posted;await environment({fetch:async(url,options)=>{posted=JSON.parse(options.body).text;return audioReply();}},async()=>{
  const voice=new LocalVoice(avatar(),()=>{});await voice.speak('x'.repeat(2000));assert.equal(posted.length,1800);assert.equal(voice.cache.get(posted).type,'audio/wav');voice.dispose();
 });
});
