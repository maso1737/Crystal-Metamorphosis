// ============================================================
// env.js — IBL 環境マップ / 背景切替 / HDRI読み込み
//   setupEnvironment(renderer, scene, state) → { applyBackground, setRotation }
//     - 手続き的 env map (PMREM) を生成し scene.environment へ
//     - .hdr アップロード対応 (RGBELoader → equirect → PMREM)
//     - bgFromEnv で「env を背景に」⇔「グラデmesh背景」を切替
//   内部状態 currentEnvMap / currentEquirect / pmremGenerator は隠蔽。
//   背景グラデmesh自体は main.js 側 (scene.userData.bgMesh) が保持。
// ============================================================
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import envFrag from './shaders/env.frag?raw';

export function setupEnvironment(renderer, scene, state){
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();

  function makeProceduralEnvMap(rotY = 0) {
    const size = 512;
    const rt = new THREE.WebGLCubeRenderTarget(size, {
      generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, type: THREE.HalfFloatType,
    });
    const envScene = new THREE.Scene();
    const envMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { uRot: { value: rotY } },
      vertexShader: `varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: envFrag
    });
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50,64,32), envMat));
    const cubeCam = new THREE.CubeCamera(0.1, 100, rt);
    cubeCam.update(renderer, envScene);
    const pmrem = pmremGenerator.fromCubemap(rt.texture);
    rt.dispose();
    return pmrem.texture;
  }

  let currentEnvMap = makeProceduralEnvMap(0);
  let currentEquirect = null;
  scene.environment = currentEnvMap;
  scene.environmentIntensity = 1.0;

  // ---------- HDRI Upload ----------
  const rgbeLoader=new RGBELoader();
  const hdriInfo=document.getElementById('hdri-info');

  document.getElementById('hdri-file').addEventListener('change', e=>{
    const file=e.target.files[0];
    if(!file||!file.name.toLowerCase().endsWith('.hdr')){hdriInfo.textContent='Error: not a .hdr file';return;}
    hdriInfo.textContent=`Loading ${file.name}...`;
    const url=URL.createObjectURL(file);
    rgbeLoader.load(url, tex=>{
      tex.mapping=THREE.EquirectangularReflectionMapping;
      const pmrem=pmremGenerator.fromEquirectangular(tex);
      if(currentEnvMap&&currentEnvMap.dispose) currentEnvMap.dispose();
      currentEnvMap=pmrem.texture;
      scene.environment=currentEnvMap;
      if(currentEquirect&&currentEquirect.dispose) currentEquirect.dispose();
      currentEquirect=tex;
      applyBackground();
      hdriInfo.textContent=`✓ ${file.name}`;
      URL.revokeObjectURL(url);
    }, undefined, ()=>{hdriInfo.textContent='Error'; URL.revokeObjectURL(url);});
  });

  function applyBackground(){
    if(state.bgFromEnv){
      scene.background=currentEnvMap;
      scene.backgroundBlurriness=state.bgBlur;
      if(scene.userData.bgMesh) scene.userData.bgMesh.visible=false;
    } else {
      scene.background=new THREE.Color(0x05081a);
      scene.backgroundBlurriness=0;
      if(scene.userData.bgMesh) scene.userData.bgMesh.visible=true;
    }
  }

  function setRotation(v){
    // Rebuild env map with rotation offset (procedural HDR only)
    if(!currentEquirect){
      const old=currentEnvMap;
      currentEnvMap=makeProceduralEnvMap(v);
      scene.environment=currentEnvMap;
      if(state.bgFromEnv){scene.background=currentEnvMap;}
      if(old&&old.dispose)old.dispose();
    } else {
      // For uploaded HDR, adjust scene.backgroundRotation
      scene.backgroundRotation.y=v;
      scene.environmentRotation.y=v;
    }
  }

  return { applyBackground, setRotation };
}
