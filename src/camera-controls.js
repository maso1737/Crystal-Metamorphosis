// ============================================================
// camera-controls.js — Orbit / Dolly / Pan + Auto-orbit + Auto-focus駆動
//   setupCameraControls(camera, host, state) → 操作API を返す
//     - left drag   : orbit (azimuth / elevation)
//     - wheel       : dolly in/out
//     - middle drag : pan (shift the look-at target)
//   返り値 API: update(t) / setMode(m) / setDist(v) / setFov(v) / resetTarget()
//   (内部状態 camMode/orbitTheta/orbitPhi/camDist/camFov/CAM_TARGET はクロージャに隠蔽)
// ============================================================
import * as THREE from 'three';

export function setupCameraControls(camera, host, state){
  let camMode='orbit'; // 'auto' | 'orbit' — orbit is default
  let orbitTheta=0, orbitPhi=Math.PI/5; // azimuth, elevation
  let orbitDragging=false, panDragging=false, orbitLast={x:0,y:0};
  let camDist=28, camFov=55;
  const CAM_TARGET=new THREE.Vector3(0,5,0);

  host.addEventListener('mousedown', e=>{
    if(camMode!=='orbit') return;
    if(e.button===0){ // left = orbit
      orbitDragging=true; orbitLast={x:e.clientX,y:e.clientY}; host.style.cursor='grabbing';
    } else if(e.button===1){ // middle (wheel button) = pan
      panDragging=true; orbitLast={x:e.clientX,y:e.clientY}; host.style.cursor='move';
      e.preventDefault();
    }
  });
  window.addEventListener('mouseup', ()=>{
    orbitDragging=false; panDragging=false;
    if(camMode==='orbit') host.style.cursor='grab';
  });
  window.addEventListener('mousemove', e=>{
    if(camMode!=='orbit') return;
    if(orbitDragging){
      const dx=e.clientX-orbitLast.x, dy=e.clientY-orbitLast.y;
      orbitTheta-=dx*0.005; orbitPhi=Math.max(0.05,Math.min(Math.PI*0.48,orbitPhi+dy*0.005));
      orbitLast={x:e.clientX,y:e.clientY};
    } else if(panDragging){
      const dx=e.clientX-orbitLast.x, dy=e.clientY-orbitLast.y;
      // Pan in screen space: move target along camera right/up vectors
      const panScale=camDist*0.0015;
      const right=new THREE.Vector3().setFromMatrixColumn(camera.matrix,0); // camera right
      const up=new THREE.Vector3().setFromMatrixColumn(camera.matrix,1);    // camera up
      CAM_TARGET.addScaledVector(right, -dx*panScale);
      CAM_TARGET.addScaledVector(up,  dy*panScale);
      orbitLast={x:e.clientX,y:e.clientY};
    }
  });
  // Prevent middle-click autoscroll
  host.addEventListener('auxclick', e=>{ if(e.button===1) e.preventDefault(); });

  // Mouse wheel = dolly in/out
  host.addEventListener('wheel', e=>{
    e.preventDefault();
    const delta=e.deltaY*0.012;
    camDist=Math.max(6, Math.min(80, camDist+delta));
    state.camDist=camDist;
    const cd=document.getElementById('camdist');
    if(cd){cd.value=camDist; document.getElementById('camdist-val').textContent=camDist.toFixed(1);}
  },{passive:false});

  function updateCamera(t){
    if(camMode==='auto'){
      camera.position.x=CAM_TARGET.x+Math.sin(t*0.08)*0.6;
      camera.position.y=CAM_TARGET.y+1+Math.sin(t*0.06)*0.4;
      camera.position.z=CAM_TARGET.z+camDist;
      camera.lookAt(CAM_TARGET);
    } else {
      camera.position.x=CAM_TARGET.x+Math.sin(orbitTheta)*Math.cos(orbitPhi)*camDist;
      camera.position.y=CAM_TARGET.y+Math.sin(orbitPhi)*camDist;
      camera.position.z=CAM_TARGET.z+Math.cos(orbitTheta)*Math.cos(orbitPhi)*camDist;
      camera.lookAt(CAM_TARGET);
    }
    camera.fov=camFov; camera.updateProjectionMatrix();

    // Auto-focus: drive DoF focus distance to the camera→target distance
    if(state.dofAutofocus){
      const fd=camera.position.distanceTo(CAM_TARGET);
      state.focusDist=fd;
      const fdEl=document.getElementById('focusdist');
      if(fdEl){fdEl.value=Math.min(80,Math.max(5,fd)); document.getElementById('focusdist-val').textContent=fd.toFixed(1);}
    }
  }

  return {
    update: updateCamera,
    setMode(m){ camMode=m; },
    setDist(v){ camDist=v; },
    setFov(v){ camFov=v; camera.fov=v; camera.updateProjectionMatrix(); },
    resetTarget(){ CAM_TARGET.set(0,5,0); },
    get target(){ return CAM_TARGET; },
  };
}
