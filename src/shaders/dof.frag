
    uniform sampler2D tDiffuse, tDepth, uNearTex;
    uniform vec2 uRes;
    uniform float uFocusDist, uFocalLen, uFstop, uMaxBlur, uCA, uNearBleed, uNearOn, uNear, uFar, uEnabled, uHexAmount, uHexSharp;
    varying vec2 vUv;

    #define TAPS 48
    #define GOLDEN 2.39996323  // golden angle (radians)

    float linearizeDepth(float d){
      float z = d * 2.0 - 1.0;
      return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
    }

    // Thin-lens signed CoC (in arbitrary screen units, scaled by uMaxBlur).
    // C = f^2 / (N (Uf - f)) * (D - Uf)/D   (sign kept: + bg, - fg)
    float computeCoC(float D){
      float f = uFocalLen;
      float Uf = uFocusDist;
      float denom = uFstop * max(Uf - f, 0.001);
      float coc = (f * f / denom) * ((D - Uf) / max(D, 0.001));
      // Normalize to a sensible screen pixel scale
      return coc * 600.0 * uMaxBlur;
    }

    // Hex aperture warp: radius as a function of angle traces a hexagon.
    // base = 1/cos(φ) → 1.0 (flat edge) .. 1.1547 (corner) = true hexagon.
    // uHexSharp amplifies the corner excursion:
    //   1 = geometric hexagon (subtle) · 2-3 = bold/pointy · higher = spiky star.
    float hexWarp(float ang, float sharp){
      float phi = mod(ang, 1.0471975512) - 0.5235987756; // ±30° from nearest flat
      float base = 1.0 / cos(phi);                        // 1.0 .. 1.1547
      return 1.0 + (base - 1.0) * sharp;
    }
    // cheap per-pixel hash → random spiral rotation, breaks up grid aliasing
    float hash21(vec2 p){
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    void main(){
      vec3 base = texture2D(tDiffuse, vUv).rgb;
      if(uEnabled < 0.5){ gl_FragColor = vec4(base, 1.0); return; }

      vec2 texel = 1.0 / uRes;
      float centerD = linearizeDepth(texture2D(tDepth, vUv).r);
      float centerCoC = computeCoC(centerD);
      float centerBlur = abs(centerCoC);

      // ============================================================
      // ★ FOREGROUND (near-field) layer — Dual-Layer DoF
      // ------------------------------------------------------------
      // The gather loop below can only blur a pixel that is itself out of
      // focus, so a sharp BG pixel just outside a blurred foreground gem
      // stays crisp → hard silhouette. Fix: a separate near-field layer is
      // rendered (foreground pixels only), blurred AND dilated at half-res in
      // earlier passes, and supplied here as uNearTex (premultiplied rgb,
      // a = dilated coverage). We composite it OVER the gather result, so a
      // near gem's colour genuinely spreads past its own outline — smoothly,
      // no per-pixel grain.
      vec4 nf = uNearOn > 0.5 ? texture2D(uNearTex, vUv) : vec4(0.0);
      vec3 nearAvg = nf.a > 0.0001 ? nf.rgb / nf.a : base; // un-premultiply
      float nearAmount = clamp(nf.a * uNearBleed, 0.0, 1.0);

      // Search radius in pixels, clamped so huge bokeh doesn't tank FPS.
      float maxR = clamp(centerBlur, 0.0, 40.0);

      // Fully sharp pixel with no self-blur → still composite any foreground
      // that bled onto it, then early out.
      if(maxR < 0.75){
        gl_FragColor = vec4(mix(base, nearAvg, nearAmount), 1.0);
        return;
      }

      // Random rotation per pixel → spiral taps don't align into a grid
      float jitter = hash21(vUv * uRes) * 6.28318530718;

      vec3 colR = base, colG = base, colB = base; // start with center (energy)
      float wsum = 1.0;
      vec3 runningAvg = base; // current-average injection target

      for(int i = 0; i < TAPS; i++){
        float fi = float(i) + 0.5;
        float r = sqrt(fi / float(TAPS));      // even area distribution
        float ang = fi * GOLDEN + jitter;      // Vogel spiral + per-pixel rotation
        float hr = r * mix(1.0, hexWarp(ang, uHexSharp), uHexAmount); // 丸⇔六角(uHexAmount) × 尖り(uHexSharp)
        vec2 dir = vec2(cos(ang), sin(ang));

        // Sample CoC at this tap to decide its influence
        vec2 baseOff = dir * hr * maxR * texel;
        float sampD = linearizeDepth(texture2D(tDepth, vUv + baseOff).r);
        float sampCoC = computeCoC(sampD);

        // Scatter-as-Gather clamp: limit how much a background sample can
        // blur into a sharp foreground pixel.
        float effCoC = min(abs(sampCoC), centerBlur * 2.0 + 1.0);

        // This tap only contributes if its blur radius reaches the center.
        float spread = abs(sampCoC) * maxR;
        float reach = r * maxR;
        float wInRange = step(reach, max(spread, centerBlur));

        // Chromatic aberration: offset radius per channel
        vec2 offR = dir * hr * (1.0 + uCA * 0.05) * effCoC * texel;
        vec2 offG = dir * hr * effCoC * texel;
        vec2 offB = dir * hr * (1.0 - uCA * 0.05) * effCoC * texel;

        vec3 sR = texture2D(tDiffuse, vUv + offR).rgb;
        vec3 sG = texture2D(tDiffuse, vUv + offG).rgb;
        vec3 sB = texture2D(tDiffuse, vUv + offB).rgb;

        // Energy conservation: in-range → real sample, out-of-range →
        // inject running average (keeps boundaries from going dark).
        float w = mix(0.8, 1.25, r); // outer taps weighted up → bright edge
        colR += mix(runningAvg, sR, wInRange).r * w;
        colG += mix(runningAvg, sG, wInRange).g * w;
        colB += mix(runningAvg, sB, wInRange).b * w;
        wsum += w;
        runningAvg = vec3(colR.r, colG.g, colB.b) / wsum;
      }

      vec3 dofColor = vec3(colR.r, colG.g, colB.b) / wsum;
      // Blend sharp→blur by center blur amount
      float blend = smoothstep(0.5, 3.0, centerBlur);
      vec3 outc = mix(base, dofColor, blend);
      // ★ foreground bleed composites OVER self/far blur (soft silhouettes)
      outc = mix(outc, nearAvg, nearAmount);

      // gentle vignette
      float vig = smoothstep(1.0, 0.3, length(vUv - 0.5));
      outc *= mix(0.82, 1.0, vig);

      gl_FragColor = vec4(outc, 1.0);
    }
  