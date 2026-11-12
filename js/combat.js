// Presentation only: pooled snow, stars and ice, contact beats and a brief camera nudge.
// Loaded after scene/audio and before game. Combat counts and collision positions stay in game.js.
'use strict';
const Combat = (() => {
  const T = THREE, root = new T.Group(); root.name = 'Combat effects'; scene.add(root);
  let seed = 0x6b53a921, sinceBeat = 1, beat = 0, shakeAge = 1, shakePower = 0;
  // Effects have their own random stream, independent of crowd layouts and gameplay.
  function random() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; }
  function pool(name, geometry, material, capacity) {
    const opacity = new T.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(T.DynamicDrawUsage);
    geometry.setAttribute('effectOpacity', opacity);
    material.transparent = true; material.depthWrite = false;
    material.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float effectOpacity; varying float vEffectOpacity;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEffectOpacity = effectOpacity;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vEffectOpacity;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vEffectOpacity;');
    };
    material.customProgramCacheKey = () => 'combat-opacity-v1';
    const mesh = new T.InstancedMesh(geometry, material, capacity);
    mesh.name = name; mesh.frustumCulled = false; mesh.count = 0;
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); root.add(mesh);
    return { mesh, opacity, next: 0, particles: Array.from({ length: capacity }, () => ({ life: 0 })) };
  }
  const starShape = new T.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? .075 : .18;
    if (i) starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    else starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  starShape.closePath();
  const starGeo = new T.ExtrudeGeometry(starShape, { depth: .045, bevelEnabled: false }); starGeo.translate(0, 0, -.0225);
  const linear = hex => new T.Color(hex).convertSRGBToLinear();
  const snow = pool('Combat snow', new T.SphereGeometry(1, 8, 6), new T.MeshLambertMaterial({ color: linear(0xd2e8f5), opacity: .82 }), 64);
  const stars = pool('Combat stars', starGeo, new T.MeshBasicMaterial({ color: linear(0xffcd45) }), 32);
  const chips = pool('Combat ice chips', new T.OctahedronGeometry(1, 0), new T.MeshLambertMaterial({ color: linear(0x7dd7ee), flatShading: true }), 32);
  const pools = [snow, stars, chips], transform = new T.Object3D();
  function add(target, values) {
    Object.assign(target.particles[target.next], values);
    target.next = (target.next + 1) % target.particles.length;
  }
  function burst(player, rival, final, strong) {
    const x = (player.cx + rival.cx) / 2, z = (player.cz + rival.cz) / 2;
    const radius = Math.min(5.2, .75 + Math.max(player.radius, rival.radius) * .85);
    const density = calm ? .5 : 1, n = Math.ceil((final ? 10 : strong ? 7 : 5) * density);
    for (let i = 0; i < n; i++) {
      // Spill to both flanks so the crowd does not hide the low cloud or its stars.
      const a = (i % 2) * Math.PI + (random() - .5) * 1.2, speed = .8 + random() * (final ? 2.1 : 1.2), life = .48 + random() * .20;
      add(snow, { x: x + (i % 2 ? -1 : 1) * radius, y: .16 + random() * .15, z: z + Math.sin(a) * radius * .55,
        vx: Math.cos(a) * speed, vy: .2 + random() * .3, vz: Math.sin(a) * speed,
        life, max: life, size: (.26 + random() * .16) * (final ? 1.25 : 1), rot: 0, spin: 0 });
    }
    for (const target of [stars, chips]) {
      const count = Math.ceil((target === stars ? (final ? 6 : 3) : (final ? 7 : 4)) * density);
      for (let i = 0; i < count; i++) {
        const a = (i % 2) * Math.PI + (random() - .5) * 1.4, speed = 1.5 + random() * 2, life = .42 + random() * .24;
        add(target, { x: x + (i % 2 ? -1 : 1) * radius, y: .35, z: z + Math.sin(a) * radius * .55,
          vx: Math.cos(a) * speed, vy: (final ? 3.4 : 2.4) + random() * .6, vz: Math.sin(a) * speed,
          life, max: life, size: target === stars ? .7 + random() * .5 : .09 + random() * .09,
          rot: random() * Math.PI * 2, spin: (random() - .5) * 11 });
      }
    }
    if (!calm) {
      const strength = final ? 1 : strong ? .85 : .65, side = beat % 2 ? -1 : 1;
      player.impact(strength, side); rival.impact(strength, -side);
      if (strong || final) { shakeAge = 0; shakePower = final ? .075 : .055; }
    }
    Sfx.brawl(final, strong);
  }
  return {
    rebase(delta) { for (const target of pools) for (const p of target.particles) p.z += delta; },
    begin(player, rival) {
      sinceBeat = 0; beat = 0;
      burst(player, rival, false, Math.max(player.tall, rival.tall) > 2.4);
    },
    damage(player, rival, lost) {
      if (lost <= 0 || sinceBeat < .21) return;
      sinceBeat = 0; beat++; burst(player, rival, false, false);
    },
    finish(player, rival) {
      beat++; burst(player, rival, true, true);
      if (!calm) player.celebrateImpact();
    },
    reset() {
      sinceBeat = shakeAge = 1; shakePower = 0; beat = 0;
      for (const target of pools) { target.mesh.count = 0; for (const p of target.particles) p.life = 0; }
    },
    update(dt, camera) {
      sinceBeat += dt; shakeAge += dt;
      for (const target of pools) {
        let count = 0;
        for (const p of target.particles) {
          if (p.life <= 0 || (p.life -= dt) <= 0) continue;
          const remaining = p.life / p.max, age = 1 - remaining, dust = target === snow;
          p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt;
          if (!dust) p.vy -= 8 * dt;
          p.rot += p.spin * dt;
          transform.position.set(p.x, Math.max(.08, p.y), p.z);
          if (target === stars) { transform.quaternion.copy(camera.quaternion); transform.rotateZ(p.rot); }
          else transform.rotation.set(dust ? 0 : p.rot * .7, p.rot, dust ? 0 : p.rot * .4);
          const scale = p.size * (dust ? .65 + age * 1.4 : .7 + remaining * .3);
          transform.scale.set(scale * (dust ? 1.3 : 1), scale * (dust ? .65 : 1), scale);
          transform.updateMatrix(); target.mesh.setMatrixAt(count, transform.matrix);
          target.opacity.setX(count++, Math.min(1, age * 12) * Math.min(1, remaining * 3));
        }
        target.mesh.count = count; target.mesh.instanceMatrix.needsUpdate = true; target.opacity.needsUpdate = true;
      }
    },
    shakeCamera(camera) {
      if (calm || shakeAge >= .15) return;
      const amount = shakePower * Math.pow(1 - shakeAge / .15, 2);
      camera.position.x += Math.sin(shakeAge * 73) * amount;
      camera.position.y += Math.sin(shakeAge * 91) * amount * .45;
    }
  };
})();
