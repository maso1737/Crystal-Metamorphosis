
    uniform sampler2D tScene, tDepth;
    uniform float uFocusDist, uFocalLen, uFstop, uMaxBlur, uNear, uFar;
    varying vec2 vUv;
    float linD(float d){ float z=d*2.0-1.0; return (2.0*uNear*uFar)/(uFar+uNear-z*(uFar-uNear)); }
    float coc(float D){
      float f=uFocalLen, Uf=uFocusDist;
      float denom=uFstop*max(Uf-f,0.001);
      return (f*f/denom)*((D-Uf)/max(D,0.001))*600.0*uMaxBlur;
    }
    void main(){
      float D=linD(texture2D(tDepth,vUv).r);
      float c=coc(D);                  // + far / - near
      float nearCoC=max(-c,0.0);       // foreground magnitude
      float cov=smoothstep(1.0,7.0,nearCoC); // ramp in only clearly-foreground px
      vec3 col=texture2D(tScene,vUv).rgb;
      gl_FragColor=vec4(col*cov, cov); // premultiplied
    }