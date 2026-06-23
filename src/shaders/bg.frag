
      varying vec2 vUv; uniform float uTime;
      void main(){
        vec2 p = vUv - 0.5; float r = length(p);
        vec3 c1 = vec3(0.012,0.022,0.055); vec3 c2 = vec3(0.035,0.06,0.14); vec3 c3 = vec3(0.07,0.12,0.26);
        float t = sin(uTime*0.04)*0.5+0.5;
        vec3 col = mix(c2,c1,smoothstep(0.0,0.9,r));
        col += c3*0.32*smoothstep(0.7,0.0,r)*(0.6+t*0.4);
        gl_FragColor = vec4(col,1.0);
      }