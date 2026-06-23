// ============================================================
// geometry/cuts.js — 宝石カット生成層 (依存: three のみ)
//   geoBuilder + 各 make*Geometry は内部実装。
//   外部公開は CUTS / CUT_IDS / cutGeometry の3つ。
//   ★鉄則: computeVertexNormals() は絶対に呼ばない (faceting維持)
// ============================================================
import * as THREE from 'three';

// ============================================================
// ★ Geometry builders
// ============================================================

// --- Diamond brilliant cut (N-fold, flat normals, NO computeVertexNormals) ---
// ============================================================
// ★ Shared geometry helpers
// ============================================================
// A faceted-geometry builder shares one positions/normals accumulator with a
// flat-shaded pushTri (per-face cross-product normal). computeVertexNormals()
// is NEVER called on any of these — faceting must stay sharp.
function geoBuilder(){
  const positions=[], normals=[];
  function pushTri(a,b,c){
    const ab=[b[0]-a[0],b[1]-a[1],b[2]-a[2]], ac=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
    const nx=ab[1]*ac[2]-ab[2]*ac[1], ny=ab[2]*ac[0]-ab[0]*ac[2], nz=ab[0]*ac[1]-ab[1]*ac[0];
    const len=Math.hypot(nx,ny,nz)||1; const n=[nx/len,ny/len,nz/len];
    positions.push(...a,...b,...c); normals.push(...n,...n,...n);
  }
  // close a convex polygon ring (array of [x,y,z]) with a fan, given an apex
  function fan(apex, ring, reverse){
    const N=ring.length;
    for(let i=0;i<N;i++){
      const a=ring[i], b=ring[(i+1)%N];
      if(reverse) pushTri(apex,a,b); else pushTri(apex,b,a);
    }
  }
  // connect two equal-length rings as a side wall (quad strip → tris)
  function wall(lower, upper){
    const N=lower.length;
    for(let i=0;i<N;i++){
      const l0=lower[i], l1=lower[(i+1)%N];
      const u0=upper[i], u1=upper[(i+1)%N];
      pushTri(l0,u1,u0); pushTri(l0,l1,u1);
    }
  }
  function centroid(ring,y){
    let x=0,z=0; for(const p of ring){x+=p[0];z+=p[2];}
    return [x/ring.length, y, z/ring.length];
  }
  function finalize(scaleToUnit){
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
    const p=g.attributes.position.array;
    // recenter on Y, then normalize size so all cuts read at a similar scale
    let ymin=1e9,ymax=-1e9,rmax=0;
    for(let i=0;i<p.length;i+=3){ymin=Math.min(ymin,p[i+1]);ymax=Math.max(ymax,p[i+1]);}
    const yc=(ymin+ymax)/2;
    for(let i=1;i<p.length;i+=3) p[i]-=yc;
    for(let i=0;i<p.length;i+=3){const r=Math.hypot(p[i],p[i+1],p[i+2]); if(r>rmax)rmax=r;}
    const sc=(scaleToUnit||0.5)/(rmax||1);
    for(let i=0;i<p.length;i++) p[i]*=sc;
    g.attributes.position.needsUpdate=true;
    return g; // NOTE: computeVertexNormals() intentionally NOT called
  }
  return {pushTri, fan, wall, centroid, finalize};
}
// polygon ring on the XZ plane at height y
function poly(rad, y, cnt, off=0, aspect=1){
  const a=[];
  for(let i=0;i<cnt;i++){const ang=(i/cnt)*Math.PI*2+off; a.push([Math.cos(ang)*rad*aspect, y, Math.sin(ang)*rad]);}
  return a;
}
// explicit rectangular ring (8-gon "step-cut" outline with chamfered corners)
function rectRing(hw, hd, y, chamfer){
  const c=Math.min(chamfer, hw*0.9, hd*0.9);
  return [
    [ hw-c, y, -hd ], [ hw, y, -hd+c ],
    [ hw, y,  hd-c ], [ hw-c, y,  hd ],
    [-(hw-c), y, hd ], [-hw, y,  hd-c ],
    [-hw, y, -(hd-c)], [-(hw-c), y, -hd ],
  ];
}

// --- Round Brilliant (Diamond) — unchanged classic round cut --------------
function makeBrilliantCutGeometry(N) {
  const tableRadius = 0.42, girdleRadius = 0.55;
  const crownHeight = 0.32, pavilionDepth = 0.78, culet = 0.04;
  const positions = [], normals = [];
  function pushTri(a, b, c) {
    const ab=[b[0]-a[0],b[1]-a[1],b[2]-a[2]], ac=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
    const nx=ab[1]*ac[2]-ab[2]*ac[1], ny=ab[2]*ac[0]-ab[0]*ac[2], nz=ab[0]*ac[1]-ab[1]*ac[0];
    const len=Math.hypot(nx,ny,nz)||1; const n=[nx/len,ny/len,nz/len];
    positions.push(...a,...b,...c); normals.push(...n,...n,...n);
  }
  function ring(rad, y, cnt, off=0) {
    const a=[];
    for(let i=0;i<cnt;i++){const ang=(i/cnt)*Math.PI*2+off; a.push([Math.cos(ang)*rad,y,Math.sin(ang)*rad]);}
    return a;
  }
  const tableY=crownHeight, culetY=-pavilionDepth;
  const tr=ring(tableRadius,tableY,N), ug=ring(girdleRadius*0.96,crownHeight*0.45,N*2), gr=ring(girdleRadius,0,N*2), lp=ring(girdleRadius*0.75,-pavilionDepth*0.45,N*2,Math.PI/N), cr=ring(culet,culetY,N,Math.PI/N);
  for(let i=0;i<N;i++) pushTri([0,tableY,0],tr[(i+1)%N],tr[i]);
  for(let i=0;i<N;i++){const t0=tr[i],t1=tr[(i+1)%N],u0=ug[i*2],u1=ug[i*2+1],u2=ug[(i*2+2)%(N*2)]; pushTri(t0,u0,u1); pushTri(t0,u1,t1); pushTri(t1,u1,u2);}
  for(let i=0;i<N*2;i++){const u0=ug[i],u1=ug[(i+1)%(N*2)],g0=gr[i],g1=gr[(i+1)%(N*2)]; pushTri(u0,g0,g1); pushTri(u0,g1,u1);}
  for(let i=0;i<N*2;i++){const g0=gr[i],g1=gr[(i+1)%(N*2)],l0=lp[i],l1=lp[(i+1)%(N*2)]; pushTri(g0,l1,l0); pushTri(g0,g1,l1);}
  for(let i=0;i<N;i++){const l0=lp[i*2],l1=lp[i*2+1],l2=lp[(i*2+2)%(N*2)],c0=cr[i],c1=cr[(i+1)%N]; pushTri(l0,c0,l1); pushTri(l1,c0,c1); pushTri(l1,c1,l2);}
  for(let i=0;i<N;i++) pushTri([0,culetY,0],cr[i],cr[(i+1)%N]);
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  const yc=(tableY+culetY)/2, sc=1.0/(girdleRadius*1.3);
  const p=g.attributes.position.array;
  for(let i=1;i<p.length;i+=3) p[i]-=yc;
  for(let i=0;i<p.length;i++) p[i]*=sc;
  g.attributes.position.needsUpdate=true;
  // NOTE: computeVertexNormals() NOT called — preserves faceting
  return g;
}

// --- Flat facet panel (N-sided polygon tile, slightly angled segments) -----
function makeFlatFacetGeometry(N) {
  N = Math.max(3, N);
  const positions=[], normals=[];
  function pushTri(a,b,c){
    const ab=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],ac=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
    const nx=ab[1]*ac[2]-ab[2]*ac[1],ny=ab[2]*ac[0]-ab[0]*ac[2],nz=ab[0]*ac[1]-ab[1]*ac[0];
    const len=Math.hypot(nx,ny,nz)||1; const n=[nx/len,ny/len,nz/len];
    positions.push(...a,...b,...c); normals.push(...n,...n,...n);
  }
  const innerR=0.28, outerR=0.55, edgeH=0.06, topH=0.10;
  function rng(r,y,cnt,off=0){const a=[];for(let i=0;i<cnt;i++){const ang=(i/cnt)*Math.PI*2+off;a.push([Math.cos(ang)*r,y,Math.sin(ang)*r]);}return a;}
  const top = rng(innerR, topH, N);
  const outer = rng(outerR, -edgeH, N*2);
  const bot = rng(innerR*0.5, -edgeH*2, N);
  for(let i=0;i<N;i++) pushTri([0,topH+0.01,0],top[(i+1)%N],top[i]);
  for(let i=0;i<N;i++){
    const t0=top[i],t1=top[(i+1)%N];
    const o0=outer[i*2],o1=outer[i*2+1],o2=outer[(i*2+2)%(N*2)];
    pushTri(t0,o0,o1); pushTri(t0,o1,t1); pushTri(t1,o1,o2);
  }
  for(let i=0;i<N;i++){
    const o0=outer[i*2],o2=outer[(i*2+2)%(N*2)];
    const b0=bot[i],b1=bot[(i+1)%N];
    pushTri(o0,o2,b1); pushTri(o0,b1,b0);
  }
  for(let i=0;i<N;i++) pushTri([0,-edgeH*2.5,0],bot[(i+1)%N],bot[i]);
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  const sc=1.0/(outerR*1.3);
  const p=g.attributes.position.array;
  for(let i=0;i<p.length;i++) p[i]*=sc;
  g.attributes.position.needsUpdate=true;
  return g;
}

// ============================================================
// ★ NEW CUT TYPES (step-cuts & angular forms)
// ============================================================
// Generic step-cut prism: terraced rectangular rings on crown + pavilion
// (the emerald / asscher / baguette family).
function makeStepCut(hw, hd, chamfer, steps){
  const {fan, wall, centroid, finalize}=geoBuilder();
  steps = steps||3;
  const crownH=0.30, pavH=0.60;
  const tableInset = 0.30;
  const ringAt=(y,inset)=>rectRing(hw*(1-inset), hd*(1-inset), y, chamfer*(1-inset));
  const crownRings=[];
  for(let s=0;s<=steps;s++){const f=s/steps; crownRings.push(ringAt(crownH*f, f*tableInset));}
  fan(centroid(crownRings[steps], crownH), crownRings[steps], true);
  for(let s=0;s<steps;s++) wall(crownRings[s], crownRings[s+1]);
  const pavRings=[];
  for(let s=0;s<=steps;s++){const f=s/steps; pavRings.push(ringAt(-pavH*f, f*0.55));}
  for(let s=0;s<steps;s++) wall(pavRings[s+1], pavRings[s]);
  fan(centroid(pavRings[steps], -pavH), pavRings[steps], false);
  return finalize(0.77);
}
function makeEmeraldGeometry(){ return makeStepCut(0.40, 0.58, 0.12, 3); }   // elongated rectangular step
function makeAsscherGeometry(){ return makeStepCut(0.50, 0.50, 0.20, 3); }   // square step, big chamfers (octagonal)
function makeBaguetteGeometry(){ return makeStepCut(0.26, 0.66, 0.04, 2); }  // slim rectangular bar

// Princess: square outline, chevron crown, sharp inverted-pyramid pavilion
function makePrincessGeometry(){
  const {pushTri, fan, finalize}=geoBuilder();
  const hw=0.5, crownH=0.26, pavH=0.62;
  const sq=(r,y)=>[[ r,y,-r],[ r,y, r],[-r,y, r],[-r,y,-r]];
  const tableR=0.30;
  const girdle=sq(hw,0), table=sq(tableR,crownH);
  fan([0,crownH,0], table, true);
  for(let i=0;i<4;i++){
    const g0=girdle[i],g1=girdle[(i+1)%4];
    const t0=table[i],t1=table[(i+1)%4];
    const mg=[(g0[0]+g1[0])/2,(g0[1]+g1[1])/2,(g0[2]+g1[2])/2];
    pushTri(t0,g0,mg); pushTri(t0,mg,t1); pushTri(t1,mg,g1);
  }
  const tip=[0,-pavH,0];
  for(let i=0;i<4;i++){
    const g0=girdle[i],g1=girdle[(i+1)%4];
    const mg=[(g0[0]+g1[0])/2, -pavH*0.42, (g0[2]+g1[2])/2];
    pushTri(g0,tip,mg); pushTri(mg,tip,g1); pushTri(g0,mg,g1);
  }
  return finalize(0.77);
}

// Marquise: pointed ellipse (navette) — two sharp tips, brilliant belly
function makeMarquiseGeometry(N){
  N = Math.max(8, N||16);
  const {pushTri, fan, wall, centroid, finalize}=geoBuilder();
  const crownH=0.22, pavH=0.5, aspect=0.42;
  const girdle=[];
  for(let i=0;i<N;i++){
    const ang=(i/N)*Math.PI*2;
    const rz=Math.sin(ang)*aspect;
    const sharp=Math.pow(Math.abs(Math.cos(ang)),0.6)*Math.sign(Math.cos(ang));
    girdle.push([sharp*0.62, 0, rz*0.62]);
  }
  const tableScale=0.55;
  const table=girdle.map(p=>[p[0]*tableScale, crownH, p[2]*tableScale]);
  fan(centroid(table,crownH), table, true);
  wall(girdle, table);
  const tip=[0,-pavH,0];
  for(let i=0;i<N;i++){const g0=girdle[i],g1=girdle[(i+1)%N]; pushTri(g0,tip,g1);}
  return finalize(0.77);
}

// Hexagon prism: chunky 6-sided step block (reads as solid hex, not flat)
function makeHexagonGeometry(){
  const {fan, wall, centroid, finalize}=geoBuilder();
  const top=poly(0.5, 0.34, 6, Math.PI/6);
  const tableTop=poly(0.34, 0.46, 6, Math.PI/6);
  const girdle=poly(0.55, 0.0, 6, Math.PI/6);
  const botTable=poly(0.34,-0.46,6,Math.PI/6);
  const bot=poly(0.5,-0.34,6,Math.PI/6);
  fan(centroid(tableTop,0.50), tableTop, true);
  wall(top, tableTop);
  wall(girdle, top);
  wall(bot, girdle);
  wall(botTable, bot);
  fan(centroid(botTable,-0.50), botTable, false);
  return finalize(0.77);
}

// Cushion: rounded-square brilliant (soft corners, brilliant pavilion)
function makeCushionGeometry(){
  const N=12;
  const {pushTri, fan, wall, centroid, finalize}=geoBuilder();
  function rs(r,y,k){
    const a=[];
    for(let i=0;i<N;i++){
      const ang=(i/N)*Math.PI*2+Math.PI/N;
      let cx=Math.cos(ang),cz=Math.sin(ang);
      cx=Math.sign(cx)*Math.pow(Math.abs(cx),k);
      cz=Math.sign(cz)*Math.pow(Math.abs(cz),k);
      a.push([cx*r,y,cz*r]);
    }
    return a;
  }
  const crownH=0.26, pavH=0.66;
  const girdle=rs(0.55,0,0.7), table=rs(0.34,crownH,0.7);
  fan(centroid(table,crownH), table, true);
  wall(girdle, table);
  const tip=[0,-pavH,0];
  for(let i=0;i<N;i++){const g0=girdle[i],g1=girdle[(i+1)%N]; pushTri(g0,tip,g1);}
  return finalize(0.77);
}

// ============================================================
// ★ Cut registry — all selectable gem shapes
// ============================================================
// Each cut: {label, build(N)->geometry, useN}. useN cuts respond to the
// N6/12/16/24 facet-count selector; fixed cuts ignore it.
export const CUTS = {
  diamond:  { label:'Diamond',   build:(N)=>makeBrilliantCutGeometry(N), useN:true  },
  flat:     { label:'Flat Facet',build:(N)=>makeFlatFacetGeometry(N),    useN:true  },
  emerald:  { label:'Emerald',   build:()=>makeEmeraldGeometry(),        useN:false },
  asscher:  { label:'Asscher',   build:()=>makeAsscherGeometry(),        useN:false },
  baguette: { label:'Baguette',  build:()=>makeBaguetteGeometry(),       useN:false },
  princess: { label:'Princess',  build:()=>makePrincessGeometry(),       useN:false },
  marquise: { label:'Marquise',  build:(N)=>makeMarquiseGeometry(N),     useN:true  },
  hexagon:  { label:'Hexagon',   build:()=>makeHexagonGeometry(),        useN:false },
  cushion:  { label:'Cushion',   build:()=>makeCushionGeometry(),        useN:false },
};
export const CUT_IDS = Object.keys(CUTS);

// geometry cache keyed by `${id}_${N}` (N only meaningful for useN cuts)
const geoCache = {};
export function cutGeometry(id, N){
  const cut=CUTS[id]||CUTS.diamond;
  const key = cut.useN ? `${id}_${N}` : id;
  if(!geoCache[key]) geoCache[key]=cut.build(N);
  return geoCache[key];
}
