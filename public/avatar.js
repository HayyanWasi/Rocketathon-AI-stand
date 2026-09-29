import * as THREE from 'three';

// Replaceable portrait-mesh adapter. setSpeaking/setLevel/stop are the public contract.
// A textured, deformable 2.5D low-poly portrait; this is not a full anatomical face rig.
export class TeacherAvatar {
  constructor(container){
    this.container=container;this.speaking=false;this.level=0;this.motion=!matchMedia('(prefers-reduced-motion: reduce)').matches;
    try{
      this.renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.setClearColor(0,0);container.append(this.renderer.domElement);
      this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(30,1,.1,30);this.camera.position.z=5.5;
      const tex=new THREE.TextureLoader().load('/assets/mahad-lowpoly.png');tex.colorSpace=THREE.SRGBColorSpace;
      this.material=new THREE.ShaderMaterial({transparent:true,uniforms:{map:{value:tex},mouth:{value:0},breath:{value:0}},vertexShader:`varying vec2 vUv; uniform float mouth; uniform float breath; void main(){vUv=uv;vec3 p=position;float jaw=exp(-pow((uv.x-.5)*10.,2.)-pow((uv.y-.64)*25.,2.));p.y-=mouth*.11*jaw;p.x+=sign(uv.x-.5)*mouth*.025*jaw;p.z+=.16*exp(-pow((uv.x-.5)*3.,2.))*sin(uv.y*3.14159);p.x*=1.+breath*.003;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,fragmentShader:`varying vec2 vUv;uniform sampler2D map;void main(){vec4 c=texture2D(map,vUv);if(c.a<.03)discard;gl_FragColor=c;
      #include <colorspace_fragment>
      }`});
      this.mesh=new THREE.Mesh(new THREE.PlaneGeometry(2.2,2.8,64,80),this.material);this.mesh.position.y=-.09;this.scene.add(this.mesh);
      this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(container);this.resize();this.tick=this.tick.bind(this);requestAnimationFrame(this.tick);
    }catch{container.innerHTML='<img class="avatar-fallback" src="/assets/mahad-lowpoly.png" alt="Low-poly AI portrait of Sir Mahad">';}
  }
  resize(){const {width,height}=this.container.getBoundingClientRect();if(!width||!height)return;this.renderer.setSize(width,height,false);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();}
  setSpeaking(value){this.speaking=value;document.querySelector('#teacher-stage').classList.toggle('speaking',value);document.querySelector('#stage-status').textContent=value?'Explaining it…':'Ready when you are';if(!value)this.level=0;}
  setLevel(value){this.level=value;}
  setMotion(value){this.motion=value;}
  stop(){this.setSpeaking(false);}
  tick(t){if(!this.renderer)return;const s=t/1000;this.material.uniforms.breath.value=this.motion?Math.sin(s*1.5):0;this.material.uniforms.mouth.value=this.speaking?(this.level||(.18+Math.abs(Math.sin(s*11))*.6)):0;if(this.motion){this.mesh.rotation.z=Math.sin(s*.65)*.009;this.mesh.rotation.y=Math.sin(s*.45)*.028;this.mesh.position.y=-.09+Math.sin(s*1.4)*.012;}this.renderer.render(this.scene,this.camera);requestAnimationFrame(this.tick);}
}
