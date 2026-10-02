import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {teachingPlan,yawDelta,smoothStep} from './choreography.js';
import {normalizeLessonText} from './lesson-text.js';

// Turn clips contain their own hip yaw. The world route owns heading, so keeping
// both would rotate the character twice and leave the next walk facing sideways.
export function stabilizeTurnClip(clip){
 const copy=clip.clone(),q=new THREE.Quaternion(),e=new THREE.Euler(0,0,0,'YXZ');
 for(const track of copy.tracks){
  if(!/Hips\.quaternion$/.test(track.name))continue;
  q.fromArray(track.values);e.setFromQuaternion(q,'YXZ');const baseYaw=e.y;
  for(let i=0;i<track.values.length;i+=4){q.fromArray(track.values,i);e.setFromQuaternion(q,'YXZ');e.y=baseYaw;q.setFromEuler(e).toArray(track.values,i);}
 }
 return copy;
}

// Replaceable scene adapter. Voice uses setSpeaking/setLevel/stop; lessons use setBoard.
export class TeacherAvatar {
 constructor(container){
  this.container=container;this.motionPreference=matchMedia('(prefers-reduced-motion: reduce)');this.motion=!this.motionPreference.matches;this.speaking=false;this.time=0;this.lessonTime=0;this.step=0;this.actions={};this.autoBoard=true;
  try{
   this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.15;container.append(this.renderer.domElement);
   this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#ddd9d0');this.scene.fog=new THREE.Fog('#ddd9d0',12,23);
   this.camera=new THREE.PerspectiveCamera(58,1,.025,45);this.home=new THREE.Vector3(.45,1.20,-.55);this.look=new THREE.Vector3(.43,1.70,-6.25);this.cameraLook=this.look.clone();this.camera.position.copy(this.home);this.camera.lookAt(this.look);
   this.scene.add(new THREE.HemisphereLight(0xfff8ed,0x77766c,2.2));const sun=new THREE.DirectionalLight(0xffeed3,2.3);sun.position.set(-4,6,-2);this.scene.add(sun);const fill=new THREE.DirectionalLight(0xffffff,.8);fill.position.set(2,3,0);this.scene.add(fill);
   this.boardCanvas=document.createElement('canvas');this.boardCanvas.width=1536;this.boardCanvas.height=730;this.boardTexture=new THREE.CanvasTexture(this.boardCanvas);this.boardTexture.colorSpace=THREE.SRGBColorSpace;this.boardTexture.anisotropy=this.renderer.capabilities.getMaxAnisotropy();
   this.boardMesh=new THREE.Mesh(new THREE.PlaneGeometry(3.40,1.61),new THREE.MeshBasicMaterial({map:this.boardTexture}));this.boardMesh.position.set(.433,1.97,-6.255);this.scene.add(this.boardMesh);this.paintBoard();
   this.makeDesk();this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(container);this.resize();this.clock=new THREE.Clock();
   this.visibilityHandler=()=>{this.clock.start();this.lastFrameTimestamp=null;this.needsRender=true;this.footstepPhase=null;this.renderer.setAnimationLoop(document.hidden?null:timestamp=>this.tick(timestamp));};
   document.addEventListener('visibilitychange',this.visibilityHandler);this.visibilityHandler();
   this.motionHandler=e=>this.setMotion(!e.matches);this.motionPreference.addEventListener('change',this.motionHandler);this.load();
  }catch(e){container.textContent='The 3D classroom needs WebGL. Text lessons still work.';console.error(e);}
 }
 async load(){
  try{
   const loader=new GLTFLoader(),textures=new THREE.TextureLoader();const [room,actor]=await Promise.all([loader.loadAsync('/assets/classroom/classroom.glb'),loader.loadAsync('/assets/teacher/teacher.glb')]);
   const maps={};await Promise.all(['walls','tables','details','posters'].map(async name=>{maps[name]=await textures.loadAsync('/assets/classroom/textures/'+name+'_Base_color.png');maps[name].colorSpace=THREE.SRGBColorSpace;maps[name].flipY=true;}));
   room.scene.scale.setScalar(.008);room.scene.traverse(n=>{if(n.isMesh){for(const m of Array.isArray(n.material)?n.material:[n.material]){m.map=maps[m.name]||null;m.needsUpdate=true;}if(n.name==='blackboard')n.visible=false;}});this.scene.add(room.scene);
   this.teacher=new THREE.Group();this.model=actor.scene;const box=new THREE.Box3().setFromObject(this.model),scale=1.78/(box.max.y-box.min.y);this.model.scale.setScalar(scale);this.model.position.y=0;
   const face=await textures.loadAsync('/assets/teacher/texture_20250901.png');face.colorSpace=THREE.SRGBColorSpace;face.flipY=true;this.model.traverse(n=>{if(n.isMesh){n.material.map=face;n.material.roughness=.9;n.material.needsUpdate=true;}});
   this.teacher.add(this.model);this.teacherHome=new THREE.Vector3(-1.25,0,-5.1);this.teacher.position.copy(this.teacherHome);this.scene.add(this.teacher);
   const shadowCanvas=document.createElement('canvas');shadowCanvas.width=128;shadowCanvas.height=128;const sc=shadowCanvas.getContext('2d'),gradient=sc.createRadialGradient(64,64,8,64,64,60);gradient.addColorStop(0,'rgba(28,25,19,.28)');gradient.addColorStop(1,'rgba(28,25,19,0)');sc.fillStyle=gradient;sc.fillRect(0,0,128,128);const shadow=new THREE.Mesh(new THREE.PlaneGeometry(.85,.58),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.012;this.teacher.add(shadow);
   this.mixer=new THREE.AnimationMixer(this.model);for(const c of actor.animations)this.actions[c.name]=this.mixer.clipAction(/^(Left|Right) Turn$/.test(c.name)?stabilizeTurnClip(c):c);
   this.play('Pointing');this.current.stopFading();this.current.time=.3;this.current.paused=true;this.mixer.update(0);this.model.updateMatrixWorld(true);
   // Anchor to the animated feet, not the centered OBJ rest pose.
   let feet=Infinity;this.model.traverse(n=>{if(n.isSkinnedMesh){n.skeleton.update();n.computeBoundingBox();feet=Math.min(feet,n.boundingBox.min.y);}});if(Number.isFinite(feet))this.model.position.y=-feet*scale;
   this.ready=true;if(this.teaching&&this.motion)this.advanceTeaching();document.querySelector('#classroom-loading').hidden=true;document.querySelector('#room-state').textContent='Front row · your desk';
  }catch(e){document.querySelector('#classroom-loading').textContent='Classroom could not load. Reload to try again; text lessons remain available.';console.error(e);}
 }
 makeDesk(){
  const wood=new THREE.MeshStandardMaterial({color:0x987953,roughness:.9});const top=new THREE.Mesh(new THREE.BoxGeometry(1.38,.055,.72),wood);top.position.set(.45,.73,-1.75);this.scene.add(top);
  const paper=document.createElement('canvas');paper.width=768;paper.height=512;const c=paper.getContext('2d');c.fillStyle='#f5f0df';c.fillRect(0,0,768,512);c.strokeStyle='#d3d8d1';c.lineWidth=2;for(let y=90;y<490;y+=35){c.beginPath();c.moveTo(45,y);c.lineTo(730,y);c.stroke();}c.strokeStyle='#c7afa0';c.beginPath();c.moveTo(92,0);c.lineTo(92,512);c.stroke();c.fillStyle='#555d54';c.font='26px Georgia';c.fillText('Physics / class notes',115,60);const t=new THREE.CanvasTexture(paper);t.colorSpace=THREE.SRGBColorSpace;
  const book=new THREE.Mesh(new THREE.BoxGeometry(.43,.009,.30),[wood,wood,new THREE.MeshBasicMaterial({map:t}),wood,wood,wood]);book.position.set(.35,.765,-1.69);book.rotation.y=-.12;this.scene.add(book);
  const pencil=new THREE.Mesh(new THREE.CylinderGeometry(.004,.004,.19,8),new THREE.MeshStandardMaterial({color:0xa28243}));pencil.rotation.z=Math.PI/2;pencil.position.set(.68,.768,-1.69);this.scene.add(pencil);
 }
 resize(){const {width,height}=this.container.getBoundingClientRect();if(width&&height){this.renderer.setSize(width,height,false);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.needsRender=true;}}
 play(name,once=false){const next=this.actions[name];if(!next)return;if(this.current===next&&!next.paused&&!once)return;this.current?.fadeOut(.3);next.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).fadeIn(.3).play();next.paused=false;next.setLoop(once?THREE.LoopOnce:THREE.LoopRepeat,once?1:Infinity);next.clampWhenFinished=true;this.current=next;this.fadeUntil=this.time+.3;this.needsRender=true;}
 gesture(name){if(!this.ready||!this.motion||!this.actions[name])return;this.teaching=false;this.route=null;this.segment=null;this.pendingReturn=false;this.play(name,true);this.gestureUntil=this.time+this.actions[name]._clip.duration;}
 walkTo(x,z,onComplete=null){
  if(!this.ready||!this.motion)return;
  const from=this.teacher.position.clone(),to=new THREE.Vector3(x,0,z),delta=to.clone().sub(from),distance=delta.length();
  if(distance<.005){onComplete?.();return;}
  const yaw=Math.atan2(delta.x,delta.z),turn=yawDelta(this.teacher.rotation.y,yaw),turnDuration=Math.abs(turn)>.12?Math.min(1.1,Math.abs(turn)/(Math.PI/2)*.65):0;
  this.route={from,to,start:this.time+turnDuration,turnStart:this.time,turnDuration,fromYaw:this.teacher.rotation.y,yaw,duration:distance/.68,onComplete,walking:!turnDuration};this.segment=null;this.footstepPhase=null;
  this.play(turnDuration?(turn>0?'Left Turn':'Right Turn'):'Walking',!!turnDuration);
 }
 holdPose(){this.play('Pointing');if(this.current){this.current.time=.3;this.current.paused=true;}this.mixer?.update(0);this.sceneStatus('Ready for your question');}
 rest(){
  this.route=null;this.pendingReturn=false;const turn=yawDelta(this.teacher.rotation.y,0);
  if(this.motion&&Math.abs(turn)>.02){this.segment={kind:'settle',start:this.time,until:this.time+.65,fromYaw:this.teacher.rotation.y,yaw:0};this.play(turn>0?'Left Turn':'Right Turn',true);}
  else{this.teacher.rotation.y=0;this.segment=null;this.holdPose();}
 }
 sceneStatus(text){document.querySelector('#stage-status').textContent=text;document.querySelector('#teacher-stage').dataset.action=text;}
 startTeaching(seconds=30){this.lessonTime??=0;this.teaching=true;this.finishAt=this.lessonTime+Math.max(8,seconds);this.boardStepInterval=Math.max(7,Math.min(18,seconds/Math.max(1,this.boardData?.steps.length||1)));this.nextPage=this.lessonTime+this.boardStepInterval;this.plan=teachingPlan(this.teacherHome||{x:-1.25,z:-5.1});this.planIndex=0;this.segment=null;this.route=null;this.gestureUntil=0;this.pendingReturn=false;if(this.ready&&this.motion)this.advanceTeaching();}
 advanceTeaching(){if(!this.teaching||!this.ready||!this.motion)return;if(!this.speaking&&this.lessonTime>=this.finishAt){this.finishTeaching();return;}const s=this.plan[this.planIndex++%this.plan.length];this.segment=null;this.route=null;
  if(s.kind==='walk'){this.sceneStatus('Walking through the explanation');this.walkTo(s.x,s.z,()=>this.advanceTeaching());}
  else{this.segment={...s,until:this.time+s.seconds,start:this.time,fromYaw:this.teacher.rotation.y};this.play(s.clip,true);this.sceneStatus(s.kind==='turn'?'Turning to the next idea':s.clip==='Pointing Forward'?'Your turn, beta':'Look at the board, beta');}
 }
 finishTeaching(){this.teaching=false;this.segment=null;this.gestureUntil=0;this.route=null;this.footstepPhase=null;if(!this.ready)return;if(!this.motion){this.pendingReturn=true;return;}if(this.teacher.position.distanceTo(this.teacherHome)<.01){this.teacher.position.copy(this.teacherHome);this.rest();return;}this.sceneStatus('Returning to the front');this.walkTo(this.teacherHome.x,this.teacherHome.z,()=>this.rest());}
 setSpeaking(value,seconds=30){this.speaking=value;document.querySelector('#teacher-stage').classList.toggle('speaking',value);if(value)this.startTeaching(seconds);else this.finishTeaching();}
 setLevel(value){this.level=value;}
 setMotion(value){
  if(this.motion===value)return;this.motion=value;this.footstepPhase=null;this.needsRender=true;
  if(!value){this.actionWasPaused=this.current?.paused;if(this.current)this.current.paused=true;if(this.cameraTransition){this.camera.position.copy(this.cameraTransition.to);this.cameraLook.copy(this.cameraTransition.toLook);this.camera.lookAt(this.cameraLook);this.cameraTransition=null;}return;}
  if(this.current)this.current.paused=!!this.actionWasPaused;
  if(this.pendingReturn)this.finishTeaching();
  else if(this.teaching&&!this.route&&!this.segment)this.advanceTeaching();
  else if(!this.teaching&&!this.route&&!this.segment&&!this.gestureUntil)this.rest();
 }
 stop(){this.setSpeaking(false);}
 setBoard(data){this.boardData=data;this.step=0;this.autoBoard=true;this.nextPage=(this.lessonTime||0)+9;this.paintBoard();this.notifyBoard();if(!data)this.finishTeaching();}
 nextBoard(){if(!this.boardData||this.step>=this.boardData.steps.length-1)return false;this.step++;this.nextPage=(this.lessonTime||0)+(this.boardStepInterval||9);this.paintBoard();this.notifyBoard();return true;}
 previousBoard(){if(!this.boardData||this.step===0)return false;this.step--;this.nextPage=(this.lessonTime||0)+(this.boardStepInterval||9);this.paintBoard();this.notifyBoard();return true;}
 setAutoBoard(value){this.autoBoard=!!value;this.nextPage=(this.lessonTime||0)+(this.boardStepInterval||9);}
 notifyBoard(){const total=this.boardData?.steps.length||0;const next=document.querySelector('#next-board'),previous=document.querySelector('#previous-board');if(next)next.disabled=!total||this.step>=total-1;if(previous)previous.disabled=!total||this.step===0;if(total)this.onBoardStep?.({step:this.step,total});}
 focusBoard(value){
  const to=value?new THREE.Vector3(.43,1.65,-3.4):this.home.clone(),toLook=value?new THREE.Vector3(.43,1.97,-6.25):this.look.clone();this.cameraLook??=this.look.clone();this.needsRender=true;
  if(!this.motion){this.camera.position.copy(to);this.cameraLook.copy(toLook);this.camera.lookAt(toLook);this.cameraTransition=null;return;}
  this.cameraTransition={from:this.camera.position.clone(),to,fromLook:this.cameraLook.clone(),toLook,start:this.lessonTime||0,duration:.7};
 }
 paintBoard(){
  this.needsRender=true;
  const c=this.boardCanvas.getContext('2d');c.fillStyle='#203a33';c.fillRect(0,0,1536,730);c.strokeStyle='#698278';c.lineWidth=3;c.strokeRect(16,16,1504,698);c.fillStyle='#97b0a0';c.font='24px Georgia';c.fillText('MAC  /  PHYSICS',65,65);
  const d=this.boardData;if(!d){c.fillStyle='#edf0de';c.font='58px Georgia';c.fillText('Let’s work it out.',65,235);c.font='32px Georgia';c.fillStyle='#abc1ad';c.fillText('Ask a physics question to begin.',65,310);this.boardTexture.needsUpdate=true;const page=document.querySelector('#board-page');if(page)page.textContent='Blackboard';return;}
  const wrap=(text,x,y,max,size=40)=>{c.font=size+'px Georgia';let line='',cy=y;for(const word of normalizeLessonText(text).split(/\s+/)){const next=line+word+' ';if(c.measureText(next).width>max&&line){c.fillText(line,x,cy);cy+=size*1.35;line=word+' ';}else line=next;}c.fillText(line,x,cy);};
  c.fillStyle='#f0f1df';wrap(d.title,65,145,1370,48);c.fillStyle='#a5c4b1';c.font='24px Georgia';c.fillText('STEP '+(this.step+1)+' / '+Math.max(1,d.steps.length),65,205);c.fillStyle='#f0f1df';wrap(d.steps[this.step]||'',65,275,d.diagram?.length?760:1370,38);c.fillStyle='#e1d8a4';wrap(d.equation||'',65,610,1370,42);
  if(d.diagram?.length){const ox=910,oy=225,sx=5,sy=3.2;c.strokeStyle='#dcebd4';c.fillStyle='#dcebd4';c.lineWidth=3;c.font='21px Georgia';for(const p of d.diagram){const x=ox+p.x*sx,y=oy+p.y*sy;c.beginPath();if(p.type==='text'){c.fillText(normalizeLessonText(p.text),x,y);continue;}if(p.type==='circle')c.ellipse(x,y,p.radius*sx,p.radius*sy,0,0,Math.PI*2);else if(p.type==='arc')c.ellipse(x,y,p.radius*sx,p.radius*sy,0,p.startAngle*Math.PI/180,p.endAngle*Math.PI/180,p.endAngle<p.startAngle);else{const x2=ox+p.x2*sx,y2=oy+p.y2*sy;c.moveTo(x,y);c.lineTo(x2,y2);if(p.type==='arrow'){const a=Math.atan2(y2-y,x2-x);c.moveTo(x2-13*Math.cos(a-.5),y2-13*Math.sin(a-.5));c.lineTo(x2,y2);c.lineTo(x2-13*Math.cos(a+.5),y2-13*Math.sin(a+.5));}}c.stroke();}}
  this.boardTexture.needsUpdate=true;document.querySelector('#board-page').textContent='Step '+(this.step+1)+' of '+Math.max(1,d.steps.length);
 }
 emitFootsteps(moved){
  const action=this.actions.Walking;if(!moved||this.current!==action||action?.paused||!action?._clip?.duration){this.footstepPhase=null;return;}
  const phase=action.time/action._clip.duration,previous=this.footstepPhase;this.footstepPhase=phase;
  if(previous==null)return;const end=phase<previous?phase+1:phase;
  for(const [contact,side] of [[.35,'left'],[.85,'right']]){const crossing=contact<=previous?contact+1:contact;if(crossing>previous&&crossing<=end)this.onFootstep?.({side,position:{x:this.teacher.position.x,y:this.teacher.position.y,z:this.teacher.position.z}});}
 }
 tick(timestamp){
  if(globalThis.document?.hidden){this.lastFrameTimestamp=null;this.footstepPhase=null;return;}
  // The mixer and lesson clock consume the entire elapsed interval only on an
  // accepted frame. Skipped display refreshes do not discard animation time.
  if(Number.isFinite(timestamp)){
   const active=this.teaching||this.speaking||this.cameraTransition||(this.motion&&(this.route||this.segment||this.gestureUntil>this.time||this.fadeUntil>this.time));
   const interval=1000/(active?30:15),elapsed=this.lastFrameTimestamp==null?Infinity:timestamp-this.lastFrameTimestamp;
   if(!this.needsRender&&elapsed>=0&&elapsed<interval-.01)return;
   this.lastFrameTimestamp=timestamp;
  }
  const dt=Math.min(this.clock.getDelta(),.08);
  this.lessonTime=(this.lessonTime||0)+dt;if(this.motion){this.time+=dt;this.mixer?.update(dt);}else this.footstepPhase=null;
  if(this.teaching&&!this.speaking&&this.lessonTime>=this.finishAt)this.finishTeaching();
  if(this.cameraTransition){const c=this.cameraTransition,t=Math.min(1,(this.lessonTime-c.start)/c.duration),ease=smoothStep(t);this.camera.position.lerpVectors(c.from,c.to,ease);this.cameraLook.lerpVectors(c.fromLook,c.toLook,ease);if(t===1){this.camera.position.copy(c.to);this.cameraLook.copy(c.toLook);this.cameraTransition=null;}this.camera.lookAt(this.cameraLook);}
  if(this.teacher&&this.motion){const before=this.teacher.position.clone();
   if(this.route){const route=this.route;
    if(this.time<route.start){this.teacher.rotation.y=route.fromYaw+yawDelta(route.fromYaw,route.yaw)*smoothStep((this.time-route.turnStart)/route.turnDuration);}
    else{if(!route.walking){route.walking=true;this.play('Walking');this.footstepPhase=null;}const t=Math.min(1,(this.time-route.start)/route.duration);this.teacher.position.lerpVectors(route.from,route.to,t);this.teacher.rotation.y=route.yaw;if(t===1){this.route=null;if(route.onComplete)route.onComplete();else this.rest();}}
   }
   else if(this.segment){const s=this.segment;this.teacher.rotation.y=s.fromYaw+yawDelta(s.fromYaw,s.yaw)*smoothStep((this.time-s.start)/Math.min(.7,s.until-s.start));if(this.time>=s.until){this.segment=null;if(s.kind==='settle'){this.teacher.rotation.y=0;this.holdPose();}else this.advanceTeaching();}}
   else if(this.gestureUntil&&this.time>=this.gestureUntil){this.gestureUntil=0;this.finishTeaching();}
   this.emitFootsteps(before.distanceToSquared(this.teacher.position)>.000001);
  }
  if(this.boardData&&this.teaching&&this.autoBoard!==false&&this.step<this.boardData.steps.length-1&&this.lessonTime>=this.nextPage)this.nextBoard();
  this.renderer.render(this.scene,this.camera);this.needsRender=false;
 }
 dispose(){document.removeEventListener('visibilitychange',this.visibilityHandler);this.motionPreference?.removeEventListener('change',this.motionHandler);this.observer?.disconnect();this.renderer?.setAnimationLoop(null);this.mixer?.stopAllAction();this.renderer?.dispose();}
}
