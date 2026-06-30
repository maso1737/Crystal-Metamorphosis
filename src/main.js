import * as THREE from 'three';
import { setupEnvironment } from './env.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { state, PRESETS } from './state.js';
import { CUTS, CUT_IDS, cutGeometry } from './geometry/cuts.js';
// GLSL fragment shaders (?raw = 静的文字列として取り込み。エディタで .frag 補完が効く)
import bgFrag          from './shaders/bg.frag?raw';
import streakFrag      from './shaders/streak.frag?raw';
import dofFrag         from './shaders/dof.frag?raw';
import nearExtractFrag from './shaders/nearExtract.frag?raw';
import nearBlurFrag    from './shaders/nearBlur.frag?raw';
import { modePosition, lerp } from './modes.js';
import { setupCameraControls } from './camera-controls.js';

// ============================================================
// ★ Renderer
// ============================================================
const host = document.getElementById('canvas-host');
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05081a);

// Procedural gradient BG mesh
{
  const bgGeo = new THREE.PlaneGeometry(2, 2);
  const bgMat = new THREE.ShaderMaterial({
    depthWrite: false, depthTest: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.999, 1.0); }`,
    fragmentShader: bgFrag
  });
  const bg = new THREE.Mesh(bgGeo, bgMat);
  bg.frustumCulled = false; bg.renderOrder = -1000;
  scene.add(bg);
  scene.userData.bg = bgMat; scene.userData.bgMesh = bg;
}

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 6, 28);
camera.lookAt(0, 5, 0);

// ============================================================
// ★ Environment (PMREM / procedural env / HDRI / background) → ./env.js
// ============================================================
const env = setupEnvironment(renderer, scene, state);

// ============================================================
// ★ Geometry builders → ./geometry/cuts.js に分離
//   CUTS / CUT_IDS / cutGeometry を import 済み
// ============================================================
// ============================================================
// ★ Instanced meshes — one InstancedMesh per cut, sharing one material
// ============================================================
const PARTICLE_COUNT = 2500;
let currentShape = 'diamond'; // active single cut (when not mixing)
let currentN = 12;
let mixEnabled = false;
let mixSet = ['diamond','emerald','hexagon']; // cuts blended when mix is ON

const gemMat = new THREE.MeshPhysicalMaterial({
  color: 0xffffff, roughness: 0.0, metalness: 0.0,
  transmission: 1.0, thickness: 2.0, ior: 2.4, dispersion: 5.0,
  attenuationDistance: 3.0, attenuationColor: new THREE.Color(0xffffff),
  clearcoat: 1.0, clearcoatRoughness: 0.0,
  transparent: false, opacity: 1.0, depthWrite: true, depthTest: true,
  blending: THREE.NormalBlending, side: THREE.DoubleSide, envMapIntensity: 1.0,
});

// One mesh per cut id. Each can hold up to PARTICLE_COUNT instances; we set
// .count each frame to however many particles are routed to it.
const meshes = {}; // id -> InstancedMesh
const tints = [[1,1,1],[0.97,1,1.05],[1,0.96,1],[0.96,1,1.02],[1.02,0.98,1],[0.95,0.98,1.04]];
// stable per-particle tint so colour doesn't flip when a particle changes mesh
const partTint = new Float32Array(PARTICLE_COUNT*3);
for(let i=0;i<PARTICLE_COUNT;i++){
  const r=Math.random(); const t=r<0.5?tints[0]:tints[Math.floor(Math.random()*tints.length)];
  partTint[i*3  ]=t[0]+(Math.random()-0.5)*0.04;
  partTint[i*3+1]=t[1]+(Math.random()-0.5)*0.04;
  partTint[i*3+2]=t[2]+(Math.random()-0.5)*0.04;
}
function makeMeshForCut(id){
  const m=new THREE.InstancedMesh(cutGeometry(id,currentN), gemMat, PARTICLE_COUNT);
  m.frustumCulled=false;
  m.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(PARTICLE_COUNT*3),3);
  m.count=0;
  scene.add(m);
  meshes[id]=m;
  return m;
}
CUT_IDS.forEach(makeMeshForCut); // create all meshes up front (empty until used)

// per-particle cut assignment
const partCut = new Array(PARTICLE_COUNT).fill('diamond');
function reassignCuts(){
  if(!mixEnabled){
    for(let i=0;i<PARTICLE_COUNT;i++) partCut[i]=currentShape;
  } else {
    const set = mixSet.length?mixSet:['diamond'];
    for(let i=0;i<PARTICLE_COUNT;i++){
      const r=seeds[i*4+3]; // deterministic by seed → stable assignment
      partCut[i]=set[Math.min(set.length-1, Math.floor(r*set.length))];
    }
  }
}

// Refresh geometry on every mesh for current N, then re-route particles.
function rebuildGeometry(){
  for(const id of CUT_IDS){
    const m=meshes[id];
    const g=cutGeometry(id,currentN);
    if(m.geometry!==g) m.geometry=g;
  }
  reassignCuts();
}

// ============================================================
// ★ Per-particle data
// ============================================================
const seeds=new Float32Array(PARTICLE_COUNT*4);
for(let i=0;i<PARTICLE_COUNT;i++){seeds[i*4]=Math.random();seeds[i*4+1]=Math.random();seeds[i*4+2]=Math.random();seeds[i*4+3]=Math.random();}
reassignCuts(); // seeds now exist → assign each particle to a cut mesh

// Mouse-influenced displacement per particle (smooth, accumulated)
// (gem mouse-interaction removed)

const dummy=new THREE.Object3D();
const HIDDEN=new THREE.Matrix4().makeScale(0.0001,0.0001,0.0001).setPosition(0,-10000,0);

// ============================================================
// ★ Mode positions → ./modes.js に分離 (modePosition / lerp を import 済み)
// ============================================================


// ============================================================
// ★ Camera orbit + dolly + pan → ./camera-controls.js に分離
//   cam.update/setMode/setDist/setFov/resetTarget を使用
// ============================================================
const cam = setupCameraControls(camera, host, state);

// ============================================================
// ★ Main update — instances
// ============================================================
// per-mesh write cursor (how many instances packed into each mesh this frame)
const meshCursor = {};
const _writeColor = new THREE.Color();
function updateInstances(t, dt){
  const mode=state.mode, prevMode=state.prevMode;
  const mix=state.modeMix<1?(state.modeMix*state.modeMix*(3-2*state.modeMix)):1;
  const gemSize=state.gemSize, sizeCurve=state.sizeCurve, density=state.density;

  for(let m=0;m<4;m++){
    const rate=state.modeSpeed[m];
    state.modeTime[m]+=dt*rate;
  }

  const btime=state.burstTime;

  // reset per-mesh cursors
  for(const id of CUT_IDS) meshCursor[id]=0;

  for(let i=0;i<PARTICLE_COUNT;i++){
    const sx=seeds[i*4],sy=seeds[i*4+1],sz=seeds[i*4+2],ts=seeds[i*4+3];
    if(sx>density) continue; // hidden particles simply aren't packed into any mesh

    const posA=modePosition(prevMode,state.modeTime[prevMode],sx,sy,sz,ts,btime,state.modeSpeed[prevMode]);
    const posB=modePosition(mode,state.modeTime[mode],sx,sy,sz,ts,btime,state.modeSpeed[mode]);
    const px=lerp(posA[0],posB[0],mix);
    const py=lerp(posA[1],posB[1],mix);
    const pz=lerp(posA[2],posB[2],mix);

    const sizeT=Math.pow(sz,sizeCurve);
    let scale=(0.15+sizeT*0.85)*gemSize;
    if(mode===2){
      const age=Math.max(state.modeTime[2]-btime,0);
      scale*=1+Math.exp(-age*1.5)*1.6;
    }

    const rotMul=(mode===1||prevMode===1)?0.15:1.0;
    const rotSpeed=(0.3+sy*0.9)*rotMul;
    const a=state.modeTime[mode]*rotSpeed+sx*Math.PI*2;
    const b=state.modeTime[mode]*rotSpeed*0.7+sy*Math.PI*2;

    // カメラ近接フェード: 近すぎる粒子を near plane でクリップする前にスケール0へ落とす
    // (フライスルー時のチカチカ＝near-plane clip の除去)。帯 2.0→4.5
    {
      const cdx=px-camera.position.x, cdy=py-camera.position.y, cdz=pz-camera.position.z;
      const cd=Math.sqrt(cdx*cdx+cdy*cdy+cdz*cdz);
      let cf=(cd-2.0)/2.5; cf=cf<0?0:(cf>1?1:cf);
      scale*=cf*cf*(3.0-2.0*cf); // smoothstep
    }

    dummy.position.set(px,py,pz);
    dummy.rotation.set(b,a,0);
    dummy.scale.set(scale,scale,scale);
    dummy.updateMatrix();

    // route into the mesh for this particle's assigned cut
    const id = partCut[i] || 'diamond';
    const m = meshes[id] || meshes.diamond;
    const slot = meshCursor[id]++;
    m.setMatrixAt(slot, dummy.matrix);
    _writeColor.setRGB(partTint[i*3],partTint[i*3+1],partTint[i*3+2]);
    m.setColorAt(slot, _writeColor);
  }

  // commit counts + buffer updates per mesh
  for(const id of CUT_IDS){
    const m=meshes[id];
    const n=meshCursor[id];
    m.count=n;
    if(n>0){
      m.instanceMatrix.needsUpdate=true;
      if(m.instanceColor) m.instanceColor.needsUpdate=true;
    }
  }
}


// ============================================================
// ★ Post-Processing — 2-pass manual DoF (no feedback loop)
//   The previous single-RT-with-shared-depth approach caused
//   "Feedback loop formed between Framebuffer and active Texture" because
//   the EffectComposer swaps read/write buffers that shared one depth
//   texture — the DoF pass tried to read the depth of the buffer it was
//   writing to.
//
//   Fix: render the scene ONCE into an independent sceneRT that owns its
//   own color + depth textures. Then the EffectComposer chain operates on
//   a SEPARATE set of buffers (no depth texture attached), and the DoF pass
//   reads sceneRT.depthTexture — a texture nothing in the chain writes to.
// ============================================================
const dpr=Math.min(window.devicePixelRatio,2);
let RTW=Math.floor(window.innerWidth*dpr), RTH=Math.floor(window.innerHeight*dpr);

// Independent scene render target with its own depth texture
const sceneDepth=new THREE.DepthTexture(RTW, RTH);
sceneDepth.type=THREE.UnsignedShortType;
const sceneRT=new THREE.WebGLRenderTarget(RTW, RTH, {
  type: THREE.HalfFloatType,
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  depthBuffer: true,
  depthTexture: sceneDepth,
});

// The composer uses its OWN buffers (no depth texture) — purely color chain.
// We feed it the already-rendered scene color via a TexturePass-like setup:
// the first pass just copies sceneRT.texture into the chain.
const composer=new EffectComposer(renderer);
composer.renderToScreen=true;

// Pass 0: copy sceneRT color into the chain
const copyShader={
  uniforms:{ tDiffuse:{value:null}, tScene:{value:sceneRT.texture} },
  vertexShader:`varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader:`uniform sampler2D tScene; varying vec2 vUv; void main(){ gl_FragColor=texture2D(tScene,vUv); }`
};
const copyPass=new ShaderPass(copyShader);
copyPass.uniforms.tScene.value=sceneRT.texture;
composer.addPass(copyPass);

const bloomPass=new UnrealBloomPass(new THREE.Vector2(window.innerWidth,window.innerHeight),0.5,0.7,0.85);
composer.addPass(bloomPass);

const streakShader={
  uniforms:{tDiffuse:{value:null},uStreak:{value:0.4},uCross:{value:0.7},uTime:{value:0},uRes:{value:new THREE.Vector2(1,1)}},
  vertexShader:`varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader:streakFrag
};
const streakPass=new ShaderPass(streakShader);
composer.addPass(streakPass);

// ============================================================
// ★ PHYSICAL DEPTH-BASED HEXAGONAL DoF (v9)
//   Upgraded per the WebGPU DoF research notes, implemented in WebGL:
//   - Thin-lens CoC: based on focal length f, F-number N, focus distance Uf
//   - Vogel-spiral sampling (golden-angle) instead of concentric rings →
//     no banding/ring artefacts, even tap distribution
//   - Hexagonal aperture warp on each sample → 6-sided iris bokeh
//   - Scatter-as-Gather clamp: sample_CoC clamped to center_CoC*2 so a
//     sharp foreground gem does NOT get eaten by background blur bleeding in
//   - RGB radius offset → axial chromatic aberration (red/blue fringe)
//   - "Current-average injection" for samples that don't overlap → energy
//     conservation, smooth foreground/background boundary
// ============================================================
const dofShader={
  uniforms:{
    tDiffuse:{value:null},
    tDepth:{value:null},
    uRes:{value:new THREE.Vector2(1,1)},
    uFocusDist:{value:25.0},   // Uf: world distance to focal plane
    uFocalLen:{value:0.05},    // f: lens focal length (m) — drives DoF depth
    uFstop:{value:2.8},        // N: F-number — smaller = shallower DoF
    uMaxBlur:{value:1.0},      // overall blur radius multiplier
    uCA:{value:0.5},           // chromatic aberration amount
    uNearBleed:{value:0.6},    // ★ foreground bleed strength (silhouette softening)
    uNearTex:{value:null},     // ★ pre-blurred, dilated near-field (premultiplied rgb, a=coverage)
    uNearOn:{value:0.0},       // ★ 1 = composite near-field layer
    uNear:{value:0.1},
    uFar:{value:200.0},
    uEnabled:{value:1.0},
    uHexAmount:{value:1.0},    // ★ 絞り形状 0=丸 1=六角
    uHexSharp:{value:2.2},     // ★ 六角の尖り 1=繊細 ~4=ゴリゴリ
  },
  vertexShader:`varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader:dofFrag
};
const dofPass=new ShaderPass(dofShader);
dofPass.uniforms.tDepth.value=sceneDepth;
composer.addPass(dofPass);
composer.addPass(new OutputPass());

// ============================================================
// ★ Near-field (Dual-Layer DoF) — foreground extracted, blurred & dilated
// ------------------------------------------------------------
// Built at HALF resolution in dedicated passes each frame (before the color
// chain), then fed into the DoF pass as uNearTex. Blurring the premultiplied
// alpha is what dilates the foreground silhouette → soft edges, no grain.
// ============================================================
let NRW=Math.max(2,Math.floor(RTW/2)), NRH=Math.max(2,Math.floor(RTH/2));
function makeNearRT(){
  return new THREE.WebGLRenderTarget(NRW, NRH, {
    type: THREE.HalfFloatType, minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter, depthBuffer: false,
  });
}
let nearRTA=makeNearRT(), nearRTB=makeNearRT();
dofPass.uniforms.uNearTex.value=nearRTA.texture; // always bind a valid sampler

// fullscreen-quad rig for manual passes into our own RTs (Three's utility =
// idiomatic, handles camera/geometry internally → no clip/cull pitfalls)
const fsQuadNear=new FullScreenQuad(null);
function runPass(mat, target){
  fsQuadNear.material=mat;
  renderer.setRenderTarget(target);
  renderer.clear(true,false,false); // color only (RTs have no depth buffer)
  fsQuadNear.render(renderer);
  renderer.setRenderTarget(null);
}

const _fsVert=`varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;

// Pass 1: extract foreground. cov = how far in front of focus this pixel is.
// Output premultiplied: rgb = color*cov, a = cov.
const nearExtractMat=new THREE.ShaderMaterial({
  depthTest:false, depthWrite:false,
  uniforms:{
    tScene:{value:sceneRT.texture}, tDepth:{value:sceneDepth},
    uFocusDist:{value:25.0}, uFocalLen:{value:0.05}, uFstop:{value:2.8},
    uMaxBlur:{value:1.0}, uNear:{value:0.1}, uFar:{value:200.0},
  },
  vertexShader:_fsVert,
  fragmentShader:nearExtractFrag
});

// Pass 2: separable premultiplied gaussian (9-tap). Blurring alpha dilates.
const nearBlurMat=new THREE.ShaderMaterial({
  depthTest:false, depthWrite:false,
  uniforms:{
    tInput:{value:null}, uTexel:{value:new THREE.Vector2(1/NRW,1/NRH)},
    uDir:{value:new THREE.Vector2(1,0)}, uRadius:{value:8.0},
  },
  vertexShader:_fsVert,
  fragmentShader:nearBlurFrag
});

// Run extract → blur(H,V) ×2 iterations. Result left in nearRTA.
function runNearField(){
  // sync CoC uniforms from the live DoF settings
  const ex=nearExtractMat.uniforms;
  ex.uFocusDist.value=dofPass.uniforms.uFocusDist.value;
  ex.uFocalLen.value =dofPass.uniforms.uFocalLen.value;
  ex.uFstop.value    =dofPass.uniforms.uFstop.value;
  ex.uMaxBlur.value  =dofPass.uniforms.uMaxBlur.value;
  ex.uNear.value     =camera.near;
  ex.uFar.value      =camera.far;
  ex.tScene.value    =sceneRT.texture;

  runPass(nearExtractMat, nearRTA);

  const bm=nearBlurMat.uniforms;
  bm.uTexel.value.set(1/NRW, 1/NRH);
  // dilation radius scales with blur strength (half-res px)
  const radius=Math.min(34, Math.max(3, 18*dofPass.uniforms.uMaxBlur.value));
  bm.uRadius.value=radius;
  for(let i=0;i<2;i++){
    bm.tInput.value=nearRTA.texture; bm.uDir.value.set(1,0); runPass(nearBlurMat, nearRTB);
    bm.tInput.value=nearRTB.texture; bm.uDir.value.set(0,1); runPass(nearBlurMat, nearRTA);
  }
  dofPass.uniforms.uNearTex.value=nearRTA.texture;
}

// ============================================================
// ★ State
// ============================================================
// state は ./state.js から import (純データ層)

// ---------- Toast ----------
const toastEl=document.getElementById('toast');
let toastTimer=null;
function toast(msg){toastEl.textContent=msg;toastEl.classList.add('show');if(toastTimer)clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastEl.classList.remove('show'),1500);}

// ---------- Mode ----------
function setMode(m){
  if(state.mode===m&&m!==2)return;
  state.prevMode=state.mode; state.mode=m; state.modeMix=0;
  if(m===2){state.modeTime[2]=0;state.burstTime=0;}
  document.querySelectorAll('.mode-btn').forEach(b=>b.classList.toggle('active',parseInt(b.dataset.mode)===m));
}
document.querySelectorAll('.mode-btn').forEach(b=>b.addEventListener('click',()=>setMode(parseInt(b.dataset.mode))));

// ---------- Generic slider ----------
function slider(id,key,onChange){
  const el=document.getElementById(id), val=document.getElementById(id+'-val');
  el.addEventListener('input',e=>{const v=parseFloat(e.target.value); state[key]=v; if(val)val.textContent=v.toFixed(2); if(onChange)onChange(v);});
}
slider('density','density');
slider('size','gemSize');
slider('sizecurve','sizeCurve');
slider('dispersion','dispersion',v=>{gemMat.dispersion=v;});
slider('ior','ior',v=>{gemMat.ior=v;});
slider('thickness','thickness',v=>{gemMat.thickness=v;});
slider('atten','attenuation',v=>{gemMat.attenuationDistance=v;});
slider('envint','envIntensity',v=>{scene.environmentIntensity=v; gemMat.envMapIntensity=v;});
slider('bgblur','bgBlur',v=>{if(scene.background&&scene.background.isTexture)scene.backgroundBlurriness=v;});
slider('envrotate','envRotate',v=>{ env.setRotation(v); });
slider('fov','camFov',v=>{cam.setFov(v); document.getElementById('fov-val').textContent=Math.round(v);});
slider('camdist','camDist',v=>{cam.setDist(v); document.getElementById('camdist-val').textContent=Math.round(v);});
slider('streak','streak');
slider('streakcross','streakCross',v=>{streakPass.uniforms.uCross.value=v;});
slider('bloom','bloom',v=>{bloomPass.strength=v;});
slider('beatflash','beatFlash');
slider('beatdiv','beatDiv',v=>{document.getElementById('beatdiv-val').textContent=Math.round(v);});
slider('exposure','exposure');

// Physical DoF sliders
slider('focusdist','focusDist',v=>{dofPass.uniforms.uFocusDist.value=v;});
slider('fstop','fstop',v=>{dofPass.uniforms.uFstop.value=v;});
slider('focallen','focalLen',v=>{dofPass.uniforms.uFocalLen.value=v/1000.0; document.getElementById('focallen-val').textContent=Math.round(v);});
slider('maxblur','maxBlur',v=>{dofPass.uniforms.uMaxBlur.value=v;});
slider('ca','ca',v=>{dofPass.uniforms.uCA.value=v;});
slider('nearbleed','nearBleed',v=>{dofPass.uniforms.uNearBleed.value=v; document.getElementById('nearbleed-val').textContent=v.toFixed(2);});
slider('hexshape','hexShape',v=>{dofPass.uniforms.uHexAmount.value=v;});
slider('hexsharp','hexSharp',v=>{dofPass.uniforms.uHexSharp.value=v;});
document.getElementById('dof-on').addEventListener('change',e=>{
  state.dofOn=e.target.checked;
  dofPass.uniforms.uEnabled.value=e.target.checked?1.0:0.0;
});
document.getElementById('dof-autofocus').addEventListener('change',e=>{
  state.dofAutofocus=e.target.checked;
  // when turning autofocus off, freeze focusDist slider as editable
  document.getElementById('focusdist').disabled=e.target.checked;
});
document.getElementById('focusdist').disabled=true; // autofocus on by default

// Speed sliders
['rise','slow','burst','rain'].forEach((name,idx)=>{
  const el=document.getElementById(`speed-${name}`);
  const val=document.getElementById(`speed-${name}-val`);
  el.addEventListener('input',e=>{
    const v=parseFloat(e.target.value);
    state.modeSpeed[idx]=v;
    val.textContent=v.toFixed(2);
  });
});
document.getElementById('fov').addEventListener('input',e=>{
  const v=parseFloat(e.target.value);
  document.getElementById('fov-val').textContent=Math.round(v);
});
document.getElementById('camdist').addEventListener('input',e=>{
  const v=parseFloat(e.target.value);
  document.getElementById('camdist-val').textContent=Math.round(v);
  cam.setDist(v);
});

// ---------- Atten Color ----------
const attenColor=document.getElementById('atten-color');
attenColor.addEventListener('input',e=>{state.attenColor=e.target.value; gemMat.attenuationColor.set(e.target.value);});
document.getElementById('atten-color-reset').addEventListener('click',()=>{state.attenColor='#ffffff'; attenColor.value='#ffffff'; gemMat.attenuationColor.set('#ffffff');});

// ---------- Geometry: cut grid ----------
const cutGridEl=document.getElementById('cut-grid');
const mixGridEl=document.getElementById('mix-grid');
function refreshCutUI(){
  document.querySelectorAll('.cut-btn').forEach(x=>x.classList.toggle('active', !mixEnabled && x.dataset.cut===currentShape));
  document.querySelectorAll('.mix-chip').forEach(x=>x.classList.toggle('on', mixSet.includes(x.dataset.cut)));
  mixGridEl.classList.toggle('enabled', mixEnabled);
}
CUT_IDS.forEach(id=>{
  // single-select cut button
  const b=document.createElement('button');
  b.className='cut-btn'+(id===currentShape?' active':'');
  b.dataset.cut=id; b.textContent=CUTS[id].label;
  b.addEventListener('click',()=>{
    if(mixEnabled){ // selecting a single cut turns mixing off for clarity
      mixEnabled=false; document.getElementById('mix-on').checked=false;
    }
    currentShape=id; state.shape=id;
    rebuildGeometry(); refreshCutUI();
  });
  cutGridEl.appendChild(b);
  // mix chip (multi-select)
  const c=document.createElement('button');
  c.className='mix-chip'+(mixSet.includes(id)?' on':'');
  c.dataset.cut=id; c.textContent=CUTS[id].label;
  c.addEventListener('click',()=>{
    const i=mixSet.indexOf(id);
    if(i>=0){ if(mixSet.length>1) mixSet.splice(i,1); } // keep at least 1
    else mixSet.push(id);
    if(mixEnabled) rebuildGeometry();
    refreshCutUI();
  });
  mixGridEl.appendChild(c);
});
document.getElementById('mix-on').addEventListener('change',e=>{
  mixEnabled=e.target.checked; state.mixEnabled=mixEnabled;
  rebuildGeometry(); refreshCutUI();
});
refreshCutUI();

// ---------- Geometry: N (facet count, affects round/flat/marquise only) ----------
document.querySelectorAll('.geo-btn').forEach(b=>{
  b.addEventListener('click',()=>{
    currentN=parseInt(b.dataset.n); state.geometryN=currentN;
    rebuildGeometry();
    document.querySelectorAll('.geo-btn').forEach(x=>x.classList.toggle('active',parseInt(x.dataset.n)===currentN));
  });
});

// ---------- Camera mode ----------
document.getElementById('cam-auto').addEventListener('click',()=>{
  cam.setMode('auto'); state.camMode='auto';
  document.getElementById('cam-auto').classList.add('active');
  document.getElementById('cam-orbit').classList.remove('active');
  host.style.cursor='crosshair';
});
document.getElementById('cam-orbit').addEventListener('click',()=>{
  cam.setMode('orbit'); state.camMode='orbit';
  document.getElementById('cam-orbit').classList.add('active');
  document.getElementById('cam-auto').classList.remove('active');
  host.style.cursor='grab';
});
// Orbit is default → set grab cursor on load
host.style.cursor='grab';

// ---------- Fullscreen ----------
document.getElementById('fullscreen-btn').addEventListener('click',()=>{
  if(!document.fullscreenElement){
    document.documentElement.requestFullscreen().catch(()=>toast('Fullscreen blocked'));
  } else {
    document.exitFullscreen();
  }
});
document.addEventListener('fullscreenchange',()=>{
  const btn=document.getElementById('fullscreen-btn');
  btn.textContent=document.fullscreenElement?'⛶ Exit Fullscreen':'⛶ Fullscreen';
});

// ---------- BG from Env ----------
document.getElementById('bg-from-env').addEventListener('change',e=>{state.bgFromEnv=e.target.checked; env.applyBackground();});

// ---------- Post-process ----------
document.getElementById('pp-on').addEventListener('change',e=>{state.postProcess=e.target.checked;});

// ---------- BPM ----------
document.getElementById('bpm').addEventListener('change',e=>{state.bpm=parseFloat(e.target.value)||128;});
document.getElementById('tap').addEventListener('click',()=>{
  const now=performance.now(); state.tapTimes.push(now);
  if(state.tapTimes.length>6)state.tapTimes.shift();
  if(state.tapTimes.length>=2){
    const diffs=[];
    for(let i=1;i<state.tapTimes.length;i++)diffs.push(state.tapTimes[i]-state.tapTimes[i-1]);
    const avg=diffs.reduce((a,b)=>a+b,0)/diffs.length;
    const bpm=Math.round(60000/avg);
    if(bpm>=40&&bpm<=240){state.bpm=bpm;document.getElementById('bpm').value=bpm;}
  }
});

// ---------- Burst / Save ----------
document.getElementById('burst-trigger').addEventListener('click',()=>setMode(2));

// ============================================================
// ★ Save PNG — clean capture path
//   EffectComposer with OutputPass writes its final result directly to the
//   WebGL canvas (renderer.domElement) when no renderToScreen override is set.
//   With preserveDrawingBuffer:true the canvas pixel data stays valid until
//   the NEXT draw call, so we just need ONE clean render → toDataURL
//   immediately in the same JS task (no rAF delay needed).
//
//   The "grid noise" artefact in v5/v6 was caused by the streak/bokeh passes
//   reading uRes at the device-pixel size while the streak accumulation used
//   window size — mismatch caused the repeating block pattern at capture time.
//   Fixed here by always setting uRes from renderer.domElement dimensions.
// ============================================================
// 1フレームを 2-pass 経路で描画 (save-png / export 共通)
function renderOnce(){
  streakPass.uniforms.uRes.value.set(RTW,RTH);
  dofPass.uniforms.uRes.value.set(RTW,RTH);
  if(state.postProcess){
    renderer.setRenderTarget(sceneRT);
    renderer.clear();
    renderer.render(scene,camera);
    renderer.setRenderTarget(null);
    const nearActive = state.dofOn && state.nearBleed>0.001 && state.maxBlur>0.001;
    if(nearActive){ runNearField(); }
    dofPass.uniforms.uNearOn.value = nearActive ? 1.0 : 0.0;
    copyPass.uniforms.tScene.value=sceneRT.texture;
    composer.render();
  } else {
    renderer.setRenderTarget(null);
    renderer.render(scene,camera);
  }
}

// 解像度プリセット
const EXPORT_RES={
  '4k':[3840,2160], '1080p':[1920,1080], 'sq4096':[4096,4096], 'sq2048':[2048,2048],
};
// 任意解像度で1枚キャプチャ → dataURL (パイプライン全体を一時リサイズ→復元)
function captureAt(W,H,blackBg){
  const origPr=renderer.getPixelRatio();
  const bgMesh=scene.userData.bgMesh;
  const prevBg=scene.background, prevVis=bgMesh?bgMesh.visible:true;
  resizePipeline(W,H,1);                       // pr=1 で正確に W×H ピクセル
  if(blackBg){ if(bgMesh)bgMesh.visible=false; scene.background=new THREE.Color(0x000000); }
  renderOnce();
  const url=renderer.domElement.toDataURL('image/png');
  if(blackBg){ if(bgMesh)bgMesh.visible=prevVis; scene.background=prevBg; }
  resizePipeline(window.innerWidth, window.innerHeight, origPr);  // 画面サイズへ復元
  return url;
}

document.getElementById('save-png').addEventListener('click',()=>{
  const sel=document.getElementById('export-res');
  const key=sel?sel.value:'4k';
  const [W,H]=EXPORT_RES[key]||EXPORT_RES['4k'];
  const blackBg=!!(document.getElementById('export-black')&&document.getElementById('export-black').checked);
  const url=captureAt(W,H,blackBg);
  const a=document.createElement('a');
  const ts=new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
  a.download=`crystal_${W}x${H}_${ts}.png`;
  a.href=url;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  toast(`✓ PNG ${W}×${H}`);
});

// ============================================================
// ★ Presets
// ============================================================
// PRESETS は ./state.js から import (純データ層)

function applyPreset(p){
  const s=state;
  s.dispersion=p.dispersion; gemMat.dispersion=p.dispersion;
  s.ior=p.ior; gemMat.ior=p.ior;
  s.thickness=p.thickness; gemMat.thickness=p.thickness;
  s.attenuation=p.attenuation; gemMat.attenuationDistance=p.attenuation;
  s.attenColor=p.attenColor; gemMat.attenuationColor.set(p.attenColor);
  s.density=p.density; s.gemSize=p.gemSize; s.sizeCurve=p.sizeCurve;
  // geometry / cut / mix
  currentN=p.geometryN||currentN; s.geometryN=currentN;
  currentShape=p.shape||'diamond'; s.shape=currentShape;
  if(Array.isArray(p.mixSet)&&p.mixSet.length){ mixSet=p.mixSet.filter(id=>CUTS[id]); if(!mixSet.length)mixSet=['diamond']; }
  mixEnabled=!!p.mixEnabled; s.mixEnabled=mixEnabled;
  rebuildGeometry();
  const mixOn=document.getElementById('mix-on'); if(mixOn)mixOn.checked=mixEnabled;
  document.querySelectorAll('.geo-btn').forEach(x=>x.classList.toggle('active',parseInt(x.dataset.n)===currentN));
  if(typeof refreshCutUI==='function') refreshCutUI();
  s.envIntensity=p.envIntensity; scene.environmentIntensity=p.envIntensity; gemMat.envMapIntensity=p.envIntensity;
  s.bgBlur=p.bgBlur; s.bgFromEnv=p.bgFromEnv;
  env.applyBackground();
  if(scene.background&&scene.background.isTexture)scene.backgroundBlurriness=p.bgBlur;
  s.streak=p.streak; s.exposure=p.exposure;
  // Physical DoF params
  if(p.fstop!==undefined){s.fstop=p.fstop; dofPass.uniforms.uFstop.value=p.fstop;}
  if(p.focalLen!==undefined){s.focalLen=p.focalLen; dofPass.uniforms.uFocalLen.value=p.focalLen/1000.0;}
  // back-compat: old presets with 'aperture' → map to an F-stop
  if(p.aperture!==undefined && p.fstop===undefined){
    const fst=Math.max(0.8, 3.0 - p.aperture*2.0);
    s.fstop=fst; dofPass.uniforms.uFstop.value=fst;
  }
  if(p.maxBlur!==undefined){s.maxBlur=p.maxBlur; dofPass.uniforms.uMaxBlur.value=p.maxBlur;}
  if(p.ca!==undefined){s.ca=p.ca; dofPass.uniforms.uCA.value=p.ca;}
  { const nb=(p.nearBleed!==undefined)?p.nearBleed:0.6; s.nearBleed=nb; dofPass.uniforms.uNearBleed.value=nb; }
  { const hx=(p.hexShape!==undefined)?p.hexShape:1.0; s.hexShape=hx; dofPass.uniforms.uHexAmount.value=hx; }
  { const hs=(p.hexSharp!==undefined)?p.hexSharp:2.2; s.hexSharp=hs; dofPass.uniforms.uHexSharp.value=hs; }
  if(p.focusDist!==undefined){s.focusDist=p.focusDist; dofPass.uniforms.uFocusDist.value=p.focusDist;}
  if(p.bloom!==undefined){s.bloom=p.bloom; bloomPass.strength=p.bloom;}
  if(p.beatFlash!==undefined)s.beatFlash=p.beatFlash;
  if(p.beatDiv!==undefined)s.beatDiv=p.beatDiv;
  syncUI();
}

function syncUI(){
  const s=state;
  const set=(id,v,fixed=2)=>{
    const el=document.getElementById(id);
    if(el){if(el.type==='range'||el.type==='number')el.value=v; else if(el.type==='checkbox')el.checked=!!v; else if(el.type==='color')el.value=v;}
    const val=document.getElementById(id+'-val');
    if(val)val.textContent=typeof v==='number'?v.toFixed(fixed):v;
  };
  set('density',s.density); set('size',s.gemSize); set('sizecurve',s.sizeCurve);
  set('dispersion',s.dispersion); set('ior',s.ior); set('thickness',s.thickness);
  set('atten',s.attenuation); document.getElementById('atten-color').value=s.attenColor;
  set('envint',s.envIntensity); set('bgblur',s.bgBlur);
  document.getElementById('bg-from-env').checked=s.bgFromEnv;
  set('streak',s.streak); set('exposure',s.exposure);
  set('streakcross', s.streakCross!==undefined?s.streakCross:0.7); streakPass.uniforms.uCross.value=(s.streakCross!==undefined?s.streakCross:0.7);
  set('fstop',s.fstop); set('maxblur',s.maxBlur); set('ca',s.ca); set('nearbleed',s.nearBleed);
  set('hexshape', s.hexShape!==undefined?s.hexShape:1.0);
  set('hexsharp', s.hexSharp!==undefined?s.hexSharp:2.2);
  if(s.beatFlash!==undefined)set('beatflash',s.beatFlash);
  if(s.beatDiv!==undefined){set('beatdiv',s.beatDiv); const bd=document.getElementById('beatdiv-val'); if(bd)bd.textContent=Math.round(s.beatDiv);}
  if(document.getElementById('focallen')){document.getElementById('focallen').value=s.focalLen;document.getElementById('focallen-val').textContent=Math.round(s.focalLen);}
  if(!s.dofAutofocus) set('focusdist',s.focusDist,1);
  if(document.getElementById('bloom')){document.getElementById('bloom').value=s.bloom;document.getElementById('bloom-val').textContent=s.bloom.toFixed(2);}
  document.getElementById('pp-on').checked=s.postProcess;
}

document.querySelectorAll('.preset-btn').forEach(b=>{
  b.addEventListener('click',()=>{if(PRESETS[b.dataset.preset]){applyPreset(PRESETS[b.dataset.preset]);toast(`Preset: ${b.dataset.preset}`);}});
});

// ============================================================
// ★ Copy / Paste params
// ============================================================
function paramsToObj(){
  return {
    dispersion:state.dispersion,ior:state.ior,thickness:state.thickness,
    attenuation:state.attenuation,attenColor:state.attenColor,
    density:state.density,gemSize:state.gemSize,sizeCurve:state.sizeCurve,
    geometryN:state.geometryN,shape:state.shape,mixEnabled:mixEnabled,mixSet:mixSet.slice(),
    envIntensity:state.envIntensity,bgBlur:state.bgBlur,bgFromEnv:state.bgFromEnv,
    fstop:state.fstop,focalLen:state.focalLen,maxBlur:state.maxBlur,ca:state.ca,nearBleed:state.nearBleed,focusDist:state.focusDist,hexShape:state.hexShape,hexSharp:state.hexSharp,
    streak:state.streak,streakCross:state.streakCross,exposure:state.exposure,bloom:state.bloom,
    beatFlash:state.beatFlash,beatDiv:state.beatDiv,
    modeSpeed:state.modeSpeed,
  };
}
document.getElementById('copy-params').addEventListener('click',async()=>{
  const json=JSON.stringify(paramsToObj(),null,2);
  try{await navigator.clipboard.writeText(json); toast('📋 Copied');}
  catch{const ta=document.createElement('textarea');ta.value=json;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);toast('📋 Copied (fallback)');}
});
document.getElementById('paste-params').addEventListener('click',async()=>{
  try{const txt=await navigator.clipboard.readText();applyPreset(JSON.parse(txt));toast('📥 Applied');}
  catch{toast('✗ Paste failed');}
});

// ============================================================
// ★ Save / Load Slots (localStorage)
// ============================================================
const SLOT_KEY='crystal_v10_slots';
const slots=[null,null,null,null];
try{const raw=localStorage.getItem(SLOT_KEY);if(raw){const p=JSON.parse(raw);for(let i=0;i<4;i++)slots[i]=p[i]||null;}}catch{}
let slotMode='save';
const slotsEl=document.getElementById('slots');
function renderSlots(){
  slotsEl.innerHTML='';
  for(let i=0;i<4;i++){
    const b=document.createElement('button');
    b.className='slot-btn'+(slots[i]?' filled':'');
    b.textContent=`${i+1}`;
    b.addEventListener('click',()=>{
      if(slotMode==='save'){
        slots[i]=paramsToObj();
        try{localStorage.setItem(SLOT_KEY,JSON.stringify(slots));}catch{}
        renderSlots(); toast(`Saved slot ${i+1}`);
      } else {
        if(slots[i]){applyPreset(slots[i]);toast(`Loaded slot ${i+1}`);}
        else toast(`Slot ${i+1} empty`);
      }
    });
    slotsEl.appendChild(b);
  }
}
renderSlots();
document.getElementById('slot-mode-save').addEventListener('click',()=>{slotMode='save';document.getElementById('slot-mode-save').classList.add('active');document.getElementById('slot-mode-load').classList.remove('active');});
document.getElementById('slot-mode-load').addEventListener('click',()=>{slotMode='load';document.getElementById('slot-mode-load').classList.add('active');document.getElementById('slot-mode-save').classList.remove('active');});

// ============================================================
// ★ Keyboard
// ============================================================
let uiHidden=false;
window.addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT'&&e.target.type!=='checkbox')return;
  if(e.key>='1'&&e.key<='4')setMode(parseInt(e.key)-1);
  else if(e.code==='Space'){e.preventDefault();setMode(2);}
  else if(e.key==='s'||e.key==='S')document.getElementById('save-png').click();
  else if(e.key==='r'||e.key==='R'){ // reset camera pan target
    cam.resetTarget();
    toast('Camera target reset');
  }
  else if(e.key==='h'||e.key==='H'){
    uiHidden=!uiHidden;
    ['ui','stats','shortcuts'].forEach(id=>{document.getElementById(id).style.display=uiHidden?'none':'';});
  }
  else if(e.key==='p'||e.key==='P'){state.postProcess=!state.postProcess;document.getElementById('pp-on').checked=state.postProcess;}
});

// ============================================================
// ★ Animation loop
// ============================================================
const clock=new THREE.Clock();
let lastFrameTime=0, lastFpsTime=0, frameCount=0;
const beatIndicator=document.getElementById('beat-indicator');
let flashEnv=0;   // ★ ビートフラッシュのエンベロープ (1→0 減衰)
const fpsEl=document.getElementById('fps');

function animate(){
  const t=clock.getElapsedTime();
  const dt=Math.min(t-lastFrameTime,0.1);
  lastFrameTime=t;

  if(state.modeMix<1)state.modeMix=Math.min(1,state.modeMix+dt/0.5);

  const beatPeriod=60/state.bpm, beatIdx=Math.floor(t/beatPeriod);
  if(beatIdx!==state.lastBeatIdx){
    state.lastBeatIdx=beatIdx;
    beatIndicator.classList.add('beat');
    setTimeout(()=>beatIndicator.classList.remove('beat'),80);
    // ビート分割ごとにフラッシュ発火 (beatDiv=何拍ごと)
    const div=Math.max(1,Math.round(state.beatDiv));
    if(beatIdx % div === 0) flashEnv=1.0;
  }
  // フラッシュ減衰 (≈0.18s) → bloom に瞬間上乗せ
  flashEnv=Math.max(0, flashEnv - dt/0.18);
  bloomPass.strength = state.bloom + flashEnv*flashEnv*state.beatFlash;

  scene.userData.bg.uniforms.uTime.value=t;
  updateInstances(t,dt);
  cam.update(t);

  streakPass.uniforms.uTime.value=t;
  streakPass.uniforms.uStreak.value=state.streak;
  streakPass.uniforms.uRes.value.set(RTW,RTH);
  // Physical DoF uniforms
  dofPass.uniforms.uRes.value.set(RTW,RTH);
  dofPass.uniforms.uFocusDist.value=state.focusDist;
  dofPass.uniforms.uNear.value=camera.near;
  dofPass.uniforms.uFar.value=camera.far;

  renderer.toneMappingExposure=state.exposure;

  if(state.postProcess){
    // Pass A: render scene into independent sceneRT (color + depth)
    renderer.setRenderTarget(sceneRT);
    renderer.clear();
    renderer.render(scene,camera);
    renderer.setRenderTarget(null);

    // Pass A2: near-field (dual-layer) — extract + dilate foreground at ½ res.
    // Skipped when it would do nothing (no blur or bleed disabled) to save GPU.
    const nearActive = state.dofOn && state.nearBleed>0.001 && state.maxBlur>0.001;
    if(nearActive){ runNearField(); }
    dofPass.uniforms.uNearOn.value = nearActive ? 1.0 : 0.0;

    // Pass B: run the color chain (copy → bloom → streak → DoF → output)
    // DoF reads sceneRT.depthTexture (chain never writes it) + uNearTex.
    copyPass.uniforms.tScene.value=sceneRT.texture;
    composer.render();
  } else {
    renderer.setRenderTarget(null);
    renderer.render(scene,camera);
  }

  frameCount++;
  if(t-lastFpsTime>0.5){fpsEl.textContent=(frameCount/(t-lastFpsTime)).toFixed(0);frameCount=0;lastFpsTime=t;}
  requestAnimationFrame(animate);
}
// Initial sync of DoF uniforms from state (so defaults match UI on load)
dofPass.uniforms.uFstop.value=state.fstop;
dofPass.uniforms.uFocalLen.value=state.focalLen/1000.0;
dofPass.uniforms.uMaxBlur.value=state.maxBlur;
dofPass.uniforms.uCA.value=state.ca;
dofPass.uniforms.uNearBleed.value=state.nearBleed;
dofPass.uniforms.uFocusDist.value=state.focusDist;
bloomPass.strength=state.bloom;

animate();

function resizePipeline(w,h,pr){
  renderer.setPixelRatio(pr);
  camera.aspect=w/h; camera.updateProjectionMatrix();
  renderer.setSize(w,h); composer.setSize(w,h);
  RTW=Math.floor(w*pr); RTH=Math.floor(h*pr);
  sceneRT.setSize(RTW,RTH);
  // DepthTexture resizes with the render target's setSize in r170,
  // but we refresh its declared dimensions to be safe.
  sceneDepth.image.width=RTW; sceneDepth.image.height=RTH; sceneDepth.needsUpdate=true;
  bloomPass.resolution.set(w,h);
  dofPass.uniforms.uRes.value.set(RTW,RTH);
  streakPass.uniforms.uRes.value.set(RTW,RTH);
  // half-res near-field targets
  NRW=Math.max(2,Math.floor(RTW/2)); NRH=Math.max(2,Math.floor(RTH/2));
  nearRTA.setSize(NRW,NRH); nearRTB.setSize(NRW,NRH);
  nearBlurMat.uniforms.uTexel.value.set(1/NRW,1/NRH);
}
window.addEventListener('resize',()=>{
  resizePipeline(window.innerWidth, window.innerHeight, Math.min(window.devicePixelRatio,2));
});
