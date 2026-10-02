// Procedural local audio. No audio downloads, services, or timers that play while idle.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
export class ClassroomSound {
 constructor({effects=true,ambient=false,volume=.35}={}){this.effects=effects;this.ambient=ambient;this.volume=clamp(volume,0,1);this.voicing=false;this.hidden=false;this.recording=false;this.nodes=new Set();this.retiringRooms=new Set();}
 async unlock(){
  try{if(!this.context){const C=globalThis.AudioContext||globalThis.webkitAudioContext;if(!C)return false;this.context=new C();this.master=this.context.createGain();this.master.gain.value=this.volume;this.master.connect(this.context.destination);this.environment=this.context.createGain();this.environment.gain.value=1;this.environment.connect(this.master);}
   if(this.context.state==='suspended')await this.context.resume();this.updateAmbient();return this.context.state==='running';
  }catch{return false;}
 }
 configure(values){Object.assign(this,values);this.volume=clamp(this.volume,0,1);if(this.context){this.master.gain.setTargetAtTime(this.volume,this.context.currentTime,.08);this.updateAmbient();}}
 setVoicing(value){this.voicing=value;this.updateAmbient();}
 setHidden(value){this.hidden=value;this.updateAmbient();if(value)this.stopTransient();}
 setRecording(value){this.recording=value;this.updateAmbient();if(value)this.stopTransient();}
 noise(seconds=1){const c=this.context,b=c.createBuffer(1,Math.ceil(c.sampleRate*seconds),c.sampleRate),d=b.getChannelData(0);let last=0;for(let i=0;i<d.length;i++){last=(last+.02*(Math.random()*2-1))/1.02;d[i]=last*3.5;}return b;}
 updateAmbient(){
  if(!this.context)return;const c=this.context,active=this.ambient&&!this.hidden&&!this.recording;
  if(active&&!this.room){const source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();source.buffer=this.roomBuffer??=this.noise(4);source.loop=true;filter.type='lowpass';filter.frequency.value=650;gain.gain.value=0;source.connect(filter);filter.connect(gain);gain.connect(this.environment);source.start();this.room={source,filter,gain};}
  if(this.room){this.room.gain.gain.setTargetAtTime(active?(this.voicing ? .009 : .032):0,c.currentTime,.22);if(!active){const room=this.room;this.room=null;this.retiringRooms.add(room);room.source.onended=()=>{room.source.disconnect();room.filter.disconnect();room.gain.disconnect();this.retiringRooms.delete(room);};room.source.stop(c.currentTime+.6);}}
 }
 track(source,chain){this.nodes.add(source);source.onended=()=>{source.disconnect();for(const n of chain)n.disconnect();this.nodes.delete(source);};}
 cue(kind='send'){
  const c=this.context;if(!c||c.state!=='running'||!this.effects||this.hidden||this.recording)return;
  const o=c.createOscillator(),g=c.createGain(),t=c.currentTime;o.type='sine';o.frequency.setValueAtTime(kind==='send'?440:620,t);o.frequency.exponentialRampToValueAtTime(kind==='send'?760:460,t+.095);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.07,t+.009);g.gain.exponentialRampToValueAtTime(.0001,t+.17);o.connect(g);g.connect(this.master);this.track(o,[g]);o.start(t);o.stop(t+.19);
 }
 footstep({position,side}={}){
  const c=this.context;if(!c||c.state!=='running'||!this.effects||this.hidden||this.recording)return;
  const s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain(),pan=c.createStereoPanner(),t=c.currentTime;s.buffer=this.stepBuffer??=this.noise(.16);s.playbackRate.value=side==='left' ? .98 : 1.03;f.type='lowpass';f.frequency.value=540;pan.pan.value=clamp(((position?.x??0)-.45)/4,-.6,.6);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(this.voicing ? .045 : .075,t+.007);g.gain.exponentialRampToValueAtTime(.0001,t+.14);s.connect(f);f.connect(g);g.connect(pan);pan.connect(this.environment);this.track(s,[f,g,pan]);s.start(t);s.stop(t+.16);
 }
 stopTransient(){for(const n of this.nodes){try{n.stop();}catch{}}}
 dispose(){this.stopTransient();for(const n of this.nodes){n.onended?.();}this.nodes.clear();for(const room of [...this.retiringRooms,this.room].filter(Boolean)){try{room.source.stop();}catch{}room.source.onended=null;room.source.disconnect();room.filter.disconnect();room.gain.disconnect();}this.room=null;this.retiringRooms.clear();this.master?.disconnect();this.environment?.disconnect();this.context?.close();}
}
