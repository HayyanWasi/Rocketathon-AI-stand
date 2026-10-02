import fs from 'node:fs';
import * as THREE from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
globalThis.window={URL};
globalThis.FileReader=class {readAsArrayBuffer(b){b.arrayBuffer().then(v=>{this.result=v;this.onloadend?.();});}readAsDataURL(b){b.arrayBuffer().then(v=>{this.result='data:'+b.type+';base64,'+Buffer.from(v).toString('base64');this.onloadend?.();});}};
THREE.TextureLoader.prototype.load=function(){return new THREE.Texture();};
const parse=file=>{const b=fs.readFileSync(file);return new FBXLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');};
const exportGLB=async(o,file,animations=[])=>{const b=await new GLTFExporter().parseAsync(o,{binary:true,animations});fs.writeFileSync(file,Buffer.from(b));console.log(file, b.byteLength);};
const names=['Pointing','Walking','Laughing','Pointing Forward','Angry Point','Right Turn','Left Turn'];
const inputs=process.argv[2]||'../../work/classroom-inputs';
const dir='public/assets/teacher';const teacher=parse(inputs+'/teacher/animations/Pointing.fbx');
const clips=[];
for(const name of names){const o=name==='Pointing'?teacher:parse(inputs+'/teacher/animations/'+name+'.fbx');const clip=o.animations[0].clone();clip.name=name;
 for(const track of clip.tracks){if(track.name==='mixamorigHips.position'){const x=track.values[0],z=track.values[2];for(let i=0;i<track.values.length;i+=3){track.values[i]=x;track.values[i+2]=z;}}}
 clips.push(clip);
}
teacher.traverse(n=>{if(n.isMesh){n.material=new THREE.MeshStandardMaterial({name:'teacher',color:0xffffff,roughness:.9});}});
await exportGLB(teacher,dir+'/teacher.glb',clips);
const room=parse(inputs+'/classroom/source/classroom.fbx');const removed=[];
room.traverse(n=>{if(n.isMesh){if(['dust','glow','light_rays','blackboard001'].includes(n.name)){removed.push(n);return;}const mats=Array.isArray(n.material)?n.material:[n.material];n.material=mats.map(m=>new THREE.MeshStandardMaterial({name:m.name,color:0xffffff,roughness:.88}));if(n.material.length===1)n.material=n.material[0];}});
for(const n of removed)n.removeFromParent();
await exportGLB(room,'public/assets/classroom/classroom.glb');
console.log('Teacher clips',clips.map(c=>({name:c.name,duration:c.duration})));console.log('Classroom meshes',room.children.length);
