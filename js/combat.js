// Presentation only: where the two crowds meet, pooled snow, stars, ice chips and impact flashes,
// a beat for the sound, a brief camera nudge and a short slow-down on the last blow.
// Loaded after scene/audio and before game. Counts and collision positions stay in game.js.
'use strict';
const Combat = (() => {
  const T = THREE, root = new T.Group(); root.name = 'Combat effects'; scene.add(root);
  let seed = 0x6b53a921, sinceBeat = 1, sinceTap = 1, beat = 0, pending = 0, shakeAge = 1, shakePower = 0, slow = 0;
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
  // A star with `points` tips; `inner` is the radius of the notches between them.
  function starShape(points, outer, inner) {
    const shape = new T.Shape();
    for (let i = 0; i < points * 2; i++) {
      const a = Math.PI / 2 + i * Math.PI / points, r = i % 2 ? inner : outer;
      if (i) shape.lineTo(Math.cos(a) * r, Math.sin(a) * r); else shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    shape.closePath();
    return shape;
  }
  const starGeo = new T.ExtrudeGeometry(starShape(5, .18, .075), { depth: .045, bevelEnabled: false }); starGeo.translate(0, 0, -.0225);
  const linear = hex => new T.Color(hex).convertSRGBToLinear();
  const snow = pool('Combat snow', new T.SphereGeometry(1, 8, 6), new T.MeshLambertMaterial({ color: linear(0xd2e8f5), opacity: .82 }), 96);
  const stars = pool('Combat stars', starGeo, new T.MeshBasicMaterial({ color: linear(0xffcd45) }), 48);
  const chips = pool('Combat ice chips', new T.OctahedronGeometry(1, 0), new T.MeshLambertMaterial({ color: linear(0x7dd7ee), flatShading: true }), 48);
  // A spiky burst that faces the camera for an instant, exactly where two characters collide.
  const flashes = pool('Combat impact flashes', new T.ShapeGeometry(starShape(9, 1, .46)), new T.MeshBasicMaterial({ color: linear(0xfff3c4) }), 16);
  const pools = [snow, stars, chips, flashes], transform = new T.Object3D();
  function add(target, values) {
    Object.assign(target.particles[target.next], values);
    target.next = (target.next + 1) % target.particles.length;
  }
  // The middle of the gap between the facing edges of the two crowds. The player is the one nearer the camera.
  function line(player, rival, out) {
    out = out || {};
    out.x = (player.cx + rival.cx) / 2;
    out.z = (player.cz - player.radius + rival.cz + rival.radius) / 2;
    return out;
  }
  // Bigger characters throw up bigger effects, so a boss fight still reads from further away.
  const sizeOf = (player, rival) => Math.max(1, Math.min(2.2, .75 + .22 * Math.max(player.tall, rival.tall)));
  // power: 0 one character's collision, 1 a beat of the brawl, 2 the last blow.
  function burst(x, z, s, power) {
    const density = calm ? .5 : 1, wide = power === 2 ? 1.5 : 1;
    for (let i = 0, n = Math.ceil([3, 6, 14][power] * density); i < n; i++) {
      const a = random() * Math.PI * 2, speed = (.7 + random() * 1.5) * s * wide, life = .42 + random() * .22;
      add(snow, { x: x + Math.cos(a) * .2 * s, y: .15 + random() * .2 * s, z: z + Math.sin(a) * .2 * s,
        vx: Math.cos(a) * speed, vy: .3 + random() * .5, vz: Math.sin(a) * speed * .7,
        life, max: life, size: (.2 + random() * .14) * s * [.8, 1, 1.3][power], rot: 0, spin: 0 });
    }
    for (const target of [stars, chips]) {
      for (let i = 0, n = Math.ceil([1, 3, 7][power] * density); i < n; i++) {
        const a = random() * Math.PI * 2, speed = (1.2 + random() * 2) * s, life = .42 + random() * .24;
        add(target, { x, y: .35 * s, z, vx: Math.cos(a) * speed, vy: ([2.4, 3, 4][power] + random() * .8) * Math.sqrt(s), vz: Math.sin(a) * speed * .7,
          life, max: life, size: (target === stars ? .9 + random() * .6 : .09 + random() * .09) * s,
          rot: random() * Math.PI * 2, spin: (random() - .5) * 11 });
      }
    }
    const life = power === 2 ? .24 : .16;
    add(flashes, { x, y: .5 * s, z, vx: 0, vy: 0, vz: 0, life, max: life, size: [.5, .75, 1.5][power] * s, rot: random() * Math.PI, spin: 0 });
  }
  function shake(power) { if (!calm) { shakeAge = 0; shakePower = power; } }
  return {
    line,
    begin(player, rival) {
      sinceBeat = 0; beat = 0; pending = 0;
      const p = line(player, rival), big = Math.max(player.tall, rival.tall) > 2.4;
      burst(p.x, p.z, sizeOf(player, rival), 1);
      if (big) shake(.055);
      Sfx.brawl(false, big);
    },
    // Called for every exchange; effects and sound keep to a steady beat however fast the numbers fall.
    damage(player, rival, lost) {
      if (lost <= 0) return;
      pending += lost;
      if (sinceBeat < .21) return;
      sinceBeat = 0; beat++;
      const p = line(player, rival), half = Math.min(player.radius, rival.radius, 4) * .8;
      burst(p.x + (random() - .5) * 2 * half, p.z, sizeOf(player, rival), 1);
      // When many fall at once, a few little ones tumbling out of the scrum stand for them.
      const bodies = calm ? 0 : pending >= 30 ? 3 : pending >= 8 ? 2 : pending >= 3 ? 1 : 0;
      for (let i = 0; i < bodies; i++) {
        Fx.fling('penguin', p.x + (random() - .5) * 2 * half, p.z + .4, 1);
        Fx.fling('crab', p.x + (random() - .5) * 2 * half, p.z - .4, -1);
      }
      pending = 0;
      Sfx.brawl(false, false);
    },
    // One character has charged into the line at (x, z).
    contact(x, z, unitScale) {
      if (sinceTap < .05) return;
      sinceTap = 0;
      burst(x, z, .7 + .35 * unitScale, 0);
      Sfx.brawl(false, false);
    },
    finish(player, rival, boss) {
      beat++;
      const p = line(player, rival);
      burst(p.x, p.z, sizeOf(player, rival) * 1.25, 2);
      Sfx.brawl(true, true);
      if (calm) return;
      player.celebrate(); shake(.075);
      slow = boss ? .3 : .1;
    },
    reset() {
      sinceBeat = sinceTap = shakeAge = 1; shakePower = 0; beat = 0; pending = 0; slow = 0;
      for (const target of pools) { target.mesh.count = 0; for (const p of target.particles) p.life = 0; }
    },
    // The last blow plays out slowly for a moment. raw is real seconds since the previous frame.
    timeScale(raw) {
      if (slow <= 0) return 1;
      slow -= raw;
      return .3;
    },
    update(dt, camera) {
      sinceBeat += dt; sinceTap += dt; shakeAge += dt;
      for (const target of pools) {
        let count = 0;
        for (const p of target.particles) {
          if (p.life <= 0 || (p.life -= dt) <= 0) continue;
          const remaining = p.life / p.max, age = 1 - remaining, dust = target === snow, flash = target === flashes;
          p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt;
          if (!dust && !flash) p.vy -= 8 * dt;
          p.rot += p.spin * dt;
          transform.position.set(p.x, Math.max(.08, p.y), p.z);
          if (target === stars || flash) { transform.quaternion.copy(camera.quaternion); transform.rotateZ(p.rot); }
          else transform.rotation.set(dust ? 0 : p.rot * .7, p.rot, dust ? 0 : p.rot * .4);
          const scale = p.size * (flash ? .45 + .75 * Math.sqrt(age) : dust ? .65 + age * 1.4 : .7 + remaining * .3);
          transform.scale.set(scale * (dust ? 1.3 : 1), scale * (dust ? .65 : 1), scale);
          transform.updateMatrix(); target.mesh.setMatrixAt(count, transform.matrix);
          target.opacity.setX(count++, flash ? remaining : Math.min(1, age * 12) * Math.min(1, remaining * 3));
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
