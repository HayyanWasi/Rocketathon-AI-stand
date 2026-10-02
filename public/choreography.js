// Deterministic movement plan; generated lesson content cannot execute scene code.
export const yawDelta=(from,to)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));
export const smoothStep=t=>{const value=Math.max(0,Math.min(1,t));return value*value*(3-2*value);};
export function teachingPlan(home){return [
 {kind:'walk',x:-.45,z:-5.05},
 {kind:'turn',clip:'Right Turn',yaw:-Math.PI/2,seconds:1},
 {kind:'walk',x:-1.8,z:-5.28},
 {kind:'turn',clip:'Right Turn',yaw:-Math.PI,seconds:1},
 {kind:'gesture',clip:'Pointing',yaw:-Math.PI,seconds:3.2},
 {kind:'walk',x:.95,z:-5.18},
 {kind:'turn',clip:'Right Turn',yaw:0,seconds:1},
 {kind:'gesture',clip:'Pointing Forward',yaw:0,seconds:3.7},
 {kind:'walk',x:home.x,z:home.z},
 {kind:'turn',clip:'Left Turn',yaw:0,seconds:1},
 {kind:'gesture',clip:'Pointing',yaw:0,seconds:2.2}
 ];}
