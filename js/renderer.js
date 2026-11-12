// 3D renderer, camera, lights, shadows and automatic quality fallback.
// Plain scripts loaded in order by index.html; top-level names are shared between files.
'use strict';

/* ---------- Renderer ---------- */
const app = $('app'), canvas = $('stage'), labels = $('labels');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); }
catch (e) { fail(); throw e; }
renderer.outputEncoding = THREE.sRGBEncoding;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(new THREE.Color(0xdff6fa).convertSRGBToLinear(), 75, 175);
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 300);
// Soft daylight, blue-lilac shade and a camera-side fill keep the navy and coral readable.
scene.add(new THREE.HemisphereLight(0xdceaff, 0x9ab0eb, 0.62));
const sun = new THREE.DirectionalLight(0xfff2df, 0.54);
sun.position.set(22, 40, -54);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
Object.assign(sun.shadow.camera, { left: -38, right: 38, top: 44, bottom: -44, near: 1, far: 130 });
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight(0xd5edff, 0.36);
fill.position.set(-14, 19, 24); fill.target.position.set(0, 1, -8);
scene.add(fill, fill.target);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// Real shadows are switched off automatically on devices that cannot keep up.
const Q = { shadows: true, locked: false, slow: 0 };
function setShadows(on) {
  Q.shadows = on; sun.castShadow = on;
  if (!on) renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
}

let portrait = false;
function resize() {
  const w = app.clientWidth || 1, h = app.clientHeight || 1;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  portrait = camera.aspect < 0.8;
  const half = Math.atan(Math.tan(27 * Math.PI / 180) / camera.aspect) * 180 / Math.PI;
  camera.fov = clamp(half * 2, 52, 84);
  camera.updateProjectionMatrix();
}
if (window.ResizeObserver) new ResizeObserver(resize).observe(app);
window.addEventListener('resize', resize);
resize();

