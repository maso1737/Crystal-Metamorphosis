
      varying vec3 vPos; uniform float uRot;
      float hash(vec3 p){ return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453); }
      void main(){
        vec3 n = normalize(vPos);
        float c = cos(uRot), s = sin(uRot);
        n = vec3(c*n.x+s*n.z, n.y, -s*n.x+c*n.z);
        float y = n.y; vec3 col = vec3(0.0);
        col += vec3(0.012,0.022,0.05)*(0.5+0.5*y);
        for(int i=0;i<4;i++){
          float fi=float(i); float bandY=-0.6+fi*0.45; float d=abs(y-bandY);
          float band=smoothstep(0.018,0.0,d);
          vec3 tint; if(i==0)tint=vec3(2.5,3.0,4.5); else if(i==1)tint=vec3(3.5,3.0,5.0); else if(i==2)tint=vec3(3.0,4.0,3.5); else tint=vec3(4.0,3.5,2.5);
          col+=band*tint*0.8;
        }
        float h1=hash(floor(n*18.0)); col+=vec3(8.0,8.0,9.0)*smoothstep(0.995,1.0,h1);
        float h2=hash(floor(n*80.0)); col+=vec3(3.0,3.2,4.0)*smoothstep(0.992,1.0,h2);
        float h3=hash(floor(n*300.0)); col+=vec3(1.5,1.5,1.8)*smoothstep(0.998,1.0,h3);
        float r=atan(n.z,n.x);
        col+=0.08*vec3(sin(r*3.0),sin(r*3.0+2.0),sin(r*3.0+4.0))*smoothstep(0.6,0.95,abs(y));
        gl_FragColor=vec4(col,1.0);
      }