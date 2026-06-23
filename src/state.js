// ============================================================
// state.js — 純データ層 (依存ゼロ)
//   - state   : 実行時パラメータの単一ソース
//   - PRESETS : プリセット定義
// applyPreset / paramsToObj は renderer/DOM 密結合のため main.js に残置。
// renderer/ui 分割後にこちらへ移設予定。
// ============================================================

export const state = {
  mode:0, prevMode:0, modeMix:1,
  modeTime:[0,0,0,0],
  modeSpeed:[1.0, 0.15, 1.0, 1.0], // rise, slow, burst, rain
  bpm:128, lastBeatIdx:-1, burstTime:-10,
  streak:0.4, bloom:0.5,
  density:0.5, gemSize:1.4, sizeCurve:1.5,
  geometryN:12, shape:'diamond', mixEnabled:false,
  dispersion:5.0, ior:2.4, thickness:2.0, attenuation:3.0, attenColor:'#ffffff',
  envIntensity:1.0, bgBlur:0.0, bgFromEnv:false, envRotate:0,
  exposure:1.0, postProcess:true,
  camMode:'orbit', camDist:28, camFov:55,
  // Physical DoF
  dofOn:true, dofAutofocus:true, focusDist:25.0, fstop:2.8, focalLen:50, maxBlur:1.0, ca:0.5, nearBleed:0.6,
  tapTimes:[],
};

export const PRESETS = {
  holographic:{dispersion:14,ior:2.2,thickness:1.8,attenuation:8,attenColor:'#fff0f8',density:0.65,gemSize:1.1,sizeCurve:2.5,geometryN:16,shape:'diamond',envIntensity:1.4,bgBlur:0.85,bgFromEnv:true,fstop:1.4,focalLen:70,maxBlur:1.6,ca:0.7,streak:0.65,exposure:1.25,bloom:0.6},
  classic:{dispersion:6,ior:2.42,thickness:2.2,attenuation:5,attenColor:'#ffffff',density:0.55,gemSize:1.4,sizeCurve:1.5,geometryN:24,shape:'diamond',envIntensity:1.0,bgBlur:0.4,bgFromEnv:false,fstop:2.8,focalLen:50,maxBlur:1.2,ca:0.5,streak:0.55,exposure:1.0,bloom:0.5},
  sapphire:{dispersion:16,ior:2.6,thickness:3.5,attenuation:1.8,attenColor:'#3868d8',density:0.4,gemSize:1.9,sizeCurve:1.3,geometryN:24,shape:'diamond',envIntensity:1.3,bgBlur:0.6,bgFromEnv:false,fstop:4.0,focalLen:85,maxBlur:1.0,ca:0.4,streak:0.45,exposure:1.1,bloom:0.55},
  opalescent:{dispersion:20,ior:2.5,thickness:2.6,attenuation:5,attenColor:'#d8ecff',density:0.55,gemSize:1.5,sizeCurve:1.8,geometryN:16,shape:'diamond',envIntensity:1.2,bgBlur:0.7,bgFromEnv:true,fstop:1.8,focalLen:60,maxBlur:1.4,ca:0.6,streak:0.7,exposure:1.15,bloom:0.65},
  champagne:{dispersion:8,ior:2.3,thickness:2.4,attenuation:2.5,attenColor:'#ffd8a0',density:0.5,gemSize:1.5,sizeCurve:1.5,geometryN:12,shape:'diamond',envIntensity:1.1,bgBlur:0.3,bgFromEnv:false,fstop:2.4,focalLen:55,maxBlur:1.1,ca:0.5,streak:0.5,exposure:1.05,bloom:0.5},
  ice:{dispersion:4,ior:2.45,thickness:1.6,attenuation:6,attenColor:'#e8f4ff',density:0.7,gemSize:1.0,sizeCurve:2.0,geometryN:12,shape:'diamond',envIntensity:1.5,bgBlur:0.55,bgFromEnv:true,fstop:1.6,focalLen:65,maxBlur:1.5,ca:0.65,streak:0.6,exposure:1.2,bloom:0.6},
};
