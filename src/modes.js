// ============================================================
// modes.js — モーション振付層 (純粋関数・依存ゼロ)
//   modePosition : Rise / Slow / Burst / Rain の位置を時刻から決定
//   lerp         : モード間ブレンド用
//   hashDir      : Burst の飛散方向 (内部実装)
//   ★ ここに新しいモードを足すと「新しい動き方」が増える
// ============================================================

function hashDir(x,y,z){
  const hx=Math.sin(x*127.1+y*311.7+z*74.7)*43758.5453;
  const hy=Math.sin(x*269.5+y*183.3+z*246.1)*43758.5453;
  const hz=Math.sin(x*113.5+y*271.9+z*124.6)*43758.5453;
  const fx=(hx-Math.floor(hx))-0.5, fy=(hy-Math.floor(hy))-0.5, fz=(hz-Math.floor(hz))-0.5;
  const len=Math.hypot(fx,fy,fz)||1;
  return [fx/len,fy/len,fz/len];
}

export function modePosition(mode, mt, sx, sy, sz, ts, btime, speedMul){
  const angle=sx*Math.PI*2, rad0=2+sy*12;
  if(mode===0){ // Rise
    const speed=(0.6+sz*0.8)*speedMul;
    const yLoop=28; const y=((sx*yLoop+mt*speed)%yLoop)-4;
    const swirl=mt*0.3+sy*Math.PI*2, r=rad0+Math.sin(mt*0.5+sx*3)*0.8;
    return[Math.cos(angle+swirl)*r,y,Math.sin(angle+swirl)*r];
  } else if(mode===1){ // Slow
    const speed=0.5*speedMul;
    const yLoop=28; const y=((sx*yLoop+mt*speed)%yLoop)-4;
    const r=rad0+Math.sin(mt*0.6+sy*3)*0.4, swirl=mt*0.3;
    return[Math.cos(angle+swirl)*r,y,Math.sin(angle+swirl)*r];
  } else if(mode===2){ // Burst
    const age=Math.max(mt-btime,0), dir=hashDir(sx+7,sy+7,sz+7);
    const damp=1-Math.exp(-age*0.8*speedMul), spread=damp*18*(0.5+ts);
    return[dir[0]*spread, 6+dir[1]*spread-0.5*age*age*0.4*speedMul, dir[2]*spread];
  } else { // Rain
    const speed=(2+sz*2)*speedMul;
    const yLoop=30; const y=((-mt*speed+sx*yLoop+15)%yLoop+yLoop)%yLoop-4;
    const r=6+sy*10, swirl=sx*Math.PI*2+mt*0.05;
    return[Math.cos(angle+swirl)*r,y,Math.sin(angle+swirl)*r];
  }
}

export function lerp(a,b,t){return a+(b-a)*t;}
