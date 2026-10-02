import fs from 'node:fs';
import * as THREE from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
globalThis.window={URL:URL};
THREE.TextureLoader.prototype.load=function(url){const t=new THREE.Texture();t.name=url;return t;};
for(const file of ['../../work/classroom-inputs/classroom/source/classroom.fbx','../../work/classroom-inputs/teacher/animations/Pointing.fbx']){
 const data=fs.readFileSync(file);const o=new FBXLoader().parse(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');o.updateMatrixWorld(true);
 console.log(file,'bounds',new THREE.Box3().setFromObject(o).min.toArray(),new THREE.Box3().setFromObject(o).max.toArray());
 const meshes=[];o.traverse(n=>{if(n.isMesh)meshes.push({name:n.name,skin:n.isSkinnedMesh,box:[new THREE.Box3().setFromObject(n).min.toArray(),new THREE.Box3().setFromObject(n).max.toArray()],materials:(Array.isArray(n.material)?n.material:[n.material]).map(m=>({name:m.name,map:m.map?.name})),bones:n.skeleton?.bones.slice(0,5).map(b=>b.name)});});
 console.log(JSON.stringify(meshes,null,2));console.log('clips',o.animations.map(a=>({name:a.name,duration:a.duration,tracks:a.tracks.slice(0,8).map(t=>t.name)})));
}
