
    uniform sampler2D tInput;
    uniform vec2 uTexel, uDir;
    uniform float uRadius;
    varying vec2 vUv;
    void main(){
      // 9-tap gaussian, step scaled so the kernel spans uRadius px
      float w[5];
      w[0]=0.227027; w[1]=0.194594; w[2]=0.121622; w[3]=0.054054; w[4]=0.016216;
      vec2 step=uDir*uTexel*(uRadius/4.0);
      vec4 acc=texture2D(tInput,vUv)*w[0];
      for(int i=1;i<5;i++){
        vec2 o=step*float(i);
        acc+=texture2D(tInput,vUv+o)*w[i];
        acc+=texture2D(tInput,vUv-o)*w[i];
      }
      gl_FragColor=acc;
    }