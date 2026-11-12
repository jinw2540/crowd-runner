// World-anchored swells, moving surface normals and restrained contact foam.
// Uses the game's existing Phong/shadow pipeline; no reflection render targets.
(function (scope) {
'use strict';
scope.createStylizedWater = function (T, seaY) {
  const linear = hex => new T.Color(hex).convertSRGBToLinear();
  const time = { value: 0 }, origin = { value: 0 };
  const waveGLSL = `
    uniform float uWaterTime; uniform float uWaterOrigin;
    float waterHeight(vec2 p) {
      p.y += uWaterOrigin;
      return .055 * sin(dot(p, vec2(.24, .15)) + uWaterTime * .72)
           + .034 * sin(dot(p, vec2(-.12, .32)) - uWaterTime * .57);
    }
    vec2 waterSlope(vec2 p) {
      p.y += uWaterOrigin;
      vec2 slope = .055 * vec2(.24, .15) * cos(dot(p, vec2(.24, .15)) + uWaterTime * .72)
                 + .034 * vec2(-.12, .32) * cos(dot(p, vec2(-.12, .32)) - uWaterTime * .57);
      slope += .11 * vec2(.85, .53) * sin(dot(p, vec2(1.28, .81)) + uWaterTime * 1.1);
      slope += .07 * vec2(-.49, .87) * sin(dot(p, vec2(-.92, 1.63)) - uWaterTime * 1.34);
      return slope;
    }
  `;
  const material = new T.MeshPhongMaterial({ color: 0xffffff, shininess: 145, specular: linear(0x315463) });
  const uniforms = { uWaterTime: time, uWaterOrigin: origin, uAqua: { value: linear(0x35bcc9) }, uHorizon: { value: linear(0x79c7de) } };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'varying vec3 vWaterWorld;\n' + waveGLSL + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
      vec3 transformed = vec3(position);
      vec3 waterWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
      transformed.y += waterHeight(waterWorld.xz);
      vWaterWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
    `);
    shader.fragmentShader = 'varying vec3 vWaterWorld;\nuniform vec3 uAqua;\nuniform vec3 uHorizon;\n' + waveGLSL + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      float distanceTint = smoothstep(16.0, 145.0, length(cameraPosition.xz - vWaterWorld.xz));
      float broadWave = sin(dot(vWaterWorld.xz + vec2(0.0, uWaterOrigin), vec2(.19, .27)) + uWaterTime * .46)
                      * cos(dot(vWaterWorld.xz + vec2(0.0, uWaterOrigin), vec2(-.16, .11)) - uWaterTime * .31);
      diffuseColor.rgb = mix(uAqua, uHorizon, distanceTint) * (1.0 + broadWave * .055);
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', `
      #include <normal_fragment_begin>
      vec2 slope = waterSlope(vWaterWorld.xz);
      normal = normalize((viewMatrix * vec4(normalize(vec3(-slope.x, 1.0, -slope.y)), 0.0)).xyz);
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <specularmap_fragment>', `
      #include <specularmap_fragment>
      float brokenGlint = .5 + .5 * sin(dot(vWaterWorld.xz + vec2(0.0, uWaterOrigin), vec2(.71, -.44)) + uWaterTime * .58);
      specularStrength *= .25 + .75 * brokenGlint * brokenGlint;
    `);
    material.userData.compiled = true;
  };
  material.customProgramCacheKey = () => 'crowd-runner-aqua-water-v1';
  const geometry = new T.PlaneGeometry(512, 512, 128, 128);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new T.Mesh(geometry, material); mesh.name = 'Clear aqua water';
  mesh.position.set(0, seaY, -150); mesh.receiveShadow = true;
  // The deformed surface extends at most .089 units outside its original plane.
  geometry.computeBoundingBox(); geometry.boundingBox.expandByScalar(.09);
  geometry.computeBoundingSphere(); geometry.boundingSphere.radius += .09;

  function createContacts(contours) {
    const root = new T.Group(); root.name = 'Ice contact foam and submerged turquoise';
    const chunks = new Map();
    function chunk(z) {
      const key = Math.floor(z / 56);
      if (!chunks.has(key)) chunks.set(key, { position: [], uv: [], phase: [], index: [] });
      return chunks.get(key);
    }
    // Four narrow rings. The inner edge starts just underneath the ice so
    // neither a white outline nor a detached halo appears around each floe.
    const widths = [-.10, .08, .34, .88];
    for (const contour of contours) {
      const points = contour.points, n = points.length;
      let along = 0;
      for (let i = 0; i < n; i++) {
        const a = points[i], b = points[(i + 1) % n], previous = points[(i + n - 1) % n], next = points[(i + 2) % n];
        const length = a.distanceTo(b), count = Math.max(1, Math.ceil(length / 2));
        const normalA = new T.Vector2(b.y - previous.y, previous.x - b.x).normalize();
        const normalB = new T.Vector2(next.y - a.y, a.x - next.x).normalize();
        for (let s = 0; s < count; s++) {
          const t0 = s / count, t1 = (s + 1) / count;
          const bin = chunk((a.y + b.y) * .5), offset = bin.position.length / 3;
          for (const t of [t0, t1]) {
            const p = a.clone().lerp(b, t), outward = normalA.clone().lerp(normalB, t).normalize();
            for (let r = 0; r < widths.length; r++) {
              const v = p.clone().addScaledVector(outward, widths[r]);
              bin.position.push(v.x, seaY + .018, v.y);
              bin.uv.push(along + length * t, r / 3); bin.phase.push(contour.phase || 0);
            }
          }
          for (let r = 0; r < widths.length - 1; r++) {
            const k = offset + r; bin.index.push(k, k + 4, k + 1, k + 1, k + 4, k + 5);
          }
        }
        along += length;
      }
    }
    const foamMaterial = new T.ShaderMaterial({
      transparent: true, depthWrite: false, side: T.DoubleSide, fog: true,
      uniforms: T.UniformsUtils.merge([T.UniformsLib.fog, {
        uWaterTime: time, uFoam: { value: linear(0xe0fbf5) }, uSubmerged: { value: linear(0x50d6cc) }
      }]),
      vertexShader: waveGLSL + `
        varying vec2 vEdge; varying float vPhase;
        attribute float edgePhase;
        #include <fog_pars_vertex>
        void main() {
          vEdge = uv; vPhase = edgePhase;
          vec3 p = position;
          p.y += waterHeight((modelMatrix * vec4(p, 1.0)).xz);
          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        uniform float uWaterTime; uniform vec3 uFoam; uniform vec3 uSubmerged;
        varying vec2 vEdge; varying float vPhase;
        #include <fog_pars_fragment>
        void main() {
          float drift = uWaterTime * .45 + vPhase;
          float foamPatch = sin(vEdge.x * 1.7 + drift) * .5 + sin(vEdge.x * 3.9 - drift * .7) * .26;
          float center = .29 + .025 * sin(vEdge.x * 2.1 + drift);
          float foam = (1.0 - smoothstep(.035, .105, abs(vEdge.y - center)))
                     * smoothstep(-.5, .48, foamPatch) * .62;
          float glow = sin(clamp(vEdge.y, 0.0, 1.0) * 3.14159265) * .22;
          float alpha = max(foam, glow);
          gl_FragColor = vec4(mix(uSubmerged, uFoam, foam / max(alpha, .001)), alpha);
          #include <tonemapping_fragment>
          #include <encodings_fragment>
          #include <fog_fragment>
        }
      `
    });
    // UniformsUtils clones values; explicitly share the clock with the sea.
    foamMaterial.uniforms.uWaterTime = time;
    foamMaterial.uniforms.uWaterOrigin = origin;
    for (const bin of chunks.values()) {
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(bin.position, 3));
      g.setAttribute('uv', new T.Float32BufferAttribute(bin.uv, 2));
      g.setAttribute('edgePhase', new T.Float32BufferAttribute(bin.phase, 1));
      g.setIndex(bin.index); g.computeBoundingBox(); g.boundingBox.expandByScalar(.09);
      g.computeBoundingSphere(); g.boundingSphere.radius += .09;
      const edge = new T.Mesh(g, foamMaterial); edge.name = 'Soft waterline'; root.add(edge);
    }
    return root;
  }
  function outline(points, { x = 0, z = 0, scale = 1, angle = 0, phase = 0 } = {}) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return { phase, points: points.map(p => new T.Vector2(x + (p.x * c + p.y * s) * scale, z + (-p.x * s + p.y * c) * scale)) };
  }
  return { mesh, uniforms, createContacts, outline, setOrigin: value => { origin.value = value; }, update: (t, reducedMotion) => { time.value = reducedMotion ? 0 : t; } };
};
})(typeof window !== 'undefined' ? window : globalThis);
