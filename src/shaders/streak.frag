
    uniform sampler2D tDiffuse; uniform float uStreak,uTime; uniform vec2 uRes; varying vec2 vUv;
    vec3 bright(vec3 c){float lum=max(c.r,max(c.g,c.b));return c*smoothstep(0.7,1.05,lum);}
    // Continuous streak: 24 taps with sub-step spacing so adjacent samples
    // overlap even at low (preview) resolution → no gridding / banding.
    vec3 sDir(vec2 uv,vec2 step,int n){
      vec3 a=vec3(0.0); float w=0.0;
      for(int i=1;i<=24;i++){
        if(i>n) break;
        float fi=float(i);
        float ww=exp(-fi*0.16);
        a+=bright(texture2D(tDiffuse,uv+step*fi).rgb)*ww;
        a+=bright(texture2D(tDiffuse,uv-step*fi).rgb)*ww;
        w+=2.0*ww;
      }
      return a/max(w,0.001);
    }
    void main(){
      vec3 base=texture2D(tDiffuse,vUv).rgb;
      if(uStreak<0.01){gl_FragColor=vec4(base,1.0);return;}
      // Step length is a fixed fraction of screen height → resolution-stable.
      // Using a small per-tap step (1.5px-equivalent) keeps samples contiguous.
      float aspect = uRes.x/uRes.y;
      float L = (1.0/uRes.y) * (1.2 + uStreak*2.5);
      vec2 dH = vec2(L/aspect, 0.0);
      vec2 dV = vec2(0.0, L);
      vec2 dD1 = vec2(L*0.707/aspect, L*0.707);
      vec2 dD2 = vec2(L*0.707/aspect, -L*0.707);
      vec3 s = (sDir(vUv,dH,22)+sDir(vUv,dV,22))*1.4
             + (sDir(vUv,dD1,16)+sDir(vUv,dD2,16))*0.7;
      gl_FragColor=vec4(base+s*vec3(1.0,1.05,1.2)*uStreak*0.9,1.0);
    }