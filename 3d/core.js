// 3D 공통 바탕: 렌더러·장면·카메라·화질 설정과 물체를 만드는 도우미들
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { KEYS, readStr } from "../shared/storage.js";

export { THREE, CSS2DObject };
export const $ = id => document.getElementById(id);
export const rand = a => a[Math.floor(Math.random() * a.length)];
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
// 받침에 따라 조사 고르기: josa("왕관", "을를") → "왕관을"
export function josa(w, pair){
  const ch = String(w).trim().slice(-1).charCodeAt(0) - 0xAC00, has = ch >= 0 && ch <= 11171 ? ch % 28 : -1;
  if (pair === "으로") return w + (has === 0 || has === 8 || has < 0 ? "로" : "으로");
  const [a, b] = [...pair]; return w + (has > 0 ? a : b);
}
export const view = $("view");
export const MOBILE = matchMedia("(pointer: coarse)").matches;
export const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
export const DEV = new URLSearchParams(location.search).has("dev");
export const FONT = { ui:"'Gowun Dodum','Apple SD Gothic Neo','Malgun Gothic',sans-serif", mono:"'Nanum Gothic Coding',ui-monospace,Consolas,monospace", dialogue:"Gaegu,'Comic Sans MS',cursive" };

/* ================= quality ================= */
// 휴대폰은 기본 '보통'(가벼운 조명·해상도 1.4배·초당 40장·그림자 끔), 컴퓨터는 '고화질'
export const QUALITY = (() => { const q = readStr(KEYS.quality, ""); return ["low", "mid", "high"].includes(q) ? q : (MOBILE ? "mid" : "high"); })();
const DPR_CAP = MOBILE ? 1.5 : 2;
export const Q = {
  low:{name:"가볍게", pr:1, aa:false, fps:30, shadow:false},
  mid:{name:"보통", pr:Math.min(1.4, DPR_CAP), aa:true, fps:40, shadow:false},
  high:{name:"고화질", pr:DPR_CAP, aa:true, fps:MOBILE ? 45 : 0, shadow:!MOBILE},
}[QUALITY];

/* ================= renderer, camera, lights ================= */
export let renderer;
try { renderer = new THREE.WebGLRenderer({ antialias: Q.aa, powerPreference: "high-performance" }); }
catch (e) { view.insertAdjacentHTML("beforeend", `<div class="err">이 브라우저에서는 3D 화면(WebGL)을 켤 수 없어요.<br><a href="https://onyoupado.github.io/Chiikawa-office/">2D 사무실로 가기</a></div>`); throw e; }
renderer.setPixelRatio(Math.min(devicePixelRatio, Q.pr));
renderer.shadowMap.enabled = Q.shadow;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.setAttribute("role", "img");
renderer.domElement.setAttribute("aria-label", "치이카와 오피스 3D 건물 화면. 캐릭터와 사물은 아래 상태창의 버튼으로도 똑같이 조작할 수 있어요.");
renderer.domElement.setAttribute("aria-describedby", "viewDesc");
view.prepend(renderer.domElement);
export const labels = new CSS2DRenderer();
labels.domElement.style.cssText = "position:absolute;inset:0;pointer-events:none";
view.appendChild(labels.domElement);

export const scene = new THREE.Scene();
scene.background = new THREE.Color("#dfeaff");
export const camera = new THREE.PerspectiveCamera(40, 1, 5, 9000);
export const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = !REDUCED; controls.maxPolarAngle = 1.5; controls.minDistance = 160; controls.maxDistance = 3600;
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
export function resize(){
  const w = view.clientWidth, h = view.clientHeight;
  renderer.setSize(w, h); labels.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(view);
export const hemi = new THREE.HemisphereLight("#ffffff", "#c9c2d8", 1.6); scene.add(hemi);
export const sun = new THREE.DirectionalLight("#fff6e8", 1.6);
sun.castShadow = true;
const SHADOW_SIZE = MOBILE ? 1024 : 2048;                    // 휴대폰 그림자 지도는 최대 1024
sun.shadow.mapSize.set(SHADOW_SIZE, SHADOW_SIZE);
Object.assign(sun.shadow.camera, { left: -720, right: 720, top: 480, bottom: -480, near: 50, far: 2600 });
sun.shadow.bias = -0.0008; scene.add(sun); scene.add(sun.target);

/* ================= world helpers ================= */
export const BX0 = -12, BX1 = 1192, BY0 = -12, BY1 = 652;     // 건물 외곽
export const CX = 590, CY = 320, FH = 150;                    // 논리 좌표 x 0~1180, y 0~640, 층 높이 150
export const fy = f => (f - 1) * FH;
export const W = (x, y, f = 1) => new THREE.Vector3(x - CX, fy(f), y - CY);
export const P = (f, x, y) => ({f, x, y});
export const G = {1: new THREE.Group(), 2: new THREE.Group(), 3: new THREE.Group()};
Object.values(G).forEach(g => scene.add(g));
export const LABELS = {1: [], 2: [], 3: []};

// 공유 재질: 개별 물체를 지울 때 dispose하면 안 되는 것들
const SHARED = new Set();
export const share = m => { SHARED.add(m); return m; };
const MATS = {};
// 고화질이 아니면 계산이 가벼운 Lambert 재질을 써요
export const mat = (c, o = {}) => {
  const k = c + JSON.stringify(o); if (MATS[k]) return MATS[k];
  if (QUALITY === "high") return MATS[k] = share(new THREE.MeshStandardMaterial({ color: c, roughness: .85, ...o }));
  const { roughness, metalness, ...rest } = o; return MATS[k] = share(new THREE.MeshLambertMaterial({ color: c, ...rest }));
};
export const GLASS = share(new THREE.MeshStandardMaterial({ color: "#bfe3ff", transparent: true, opacity: .32, roughness: .1, depthWrite: false }));
export const HITMAT = share(new THREE.MeshBasicMaterial({ visible: false }));

// 객체 전용 geometry·material·texture를 해제해요 (공유 재질은 건드리지 않아요)
export function disposeObject(obj){
  if (!obj) return;
  obj.parent?.remove(obj);
  obj.traverse(o => {
    if (o.geometry && !o.userData.sharedGeometry) o.geometry.dispose();
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of ms){ if (SHARED.has(m)) continue; m.map?.dispose(); m.dispose(); }
  });
}

// 움직이지 않는 물체를 재질별로 하나로 합쳐서 그리기 요청을 줄여요
export function mergeStatic(group){
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert(), buckets = new Map();
  for (const m of [...group.children]){
    if (!m.isMesh || m.isInstancedMesh || m.userData.dyn || m.material.map || !m.material.visible) continue;
    if (!buckets.has(m.material)) buckets.set(m.material, []);
    buckets.get(m.material).push(m);
  }
  let before = 0, after = 0;
  for (const [material, list] of buckets){
    before += list.length; if (list.length < 2){ after += list.length; continue; }
    const geos = list.map(m => { let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); g = g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld)); for (const a of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(a)) g.deleteAttribute(a); return g; });
    const merged = mergeGeometries(geos, false); if (!merged){ after += list.length; continue; }
    const mesh = new THREE.Mesh(merged, material); mesh.castShadow = list.some(m => m.castShadow); mesh.receiveShadow = true; mesh.renderOrder = list[0].renderOrder;
    list.forEach(m => { group.remove(m); m.geometry.dispose(); }); geos.forEach(g => g.dispose()); group.add(mesh); after++;
  }
  return [before, after];
}

// 같은 모양을 여러 개 그릴 때는 InstancedMesh 하나로 (창틀·책·도로 표식·꽃)
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1), UNIT_BALL = new THREE.SphereGeometry(1, 10, 8);
export function instanced(parent, items, material, shape = "box"){
  // items: [{x, y, z, sx, sy, sz}] (월드 좌표, 크기)
  const im = new THREE.InstancedMesh(shape === "ball" ? UNIT_BALL : UNIT_BOX, material, items.length);
  im.userData.sharedGeometry = true;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  items.forEach((it, i) => { p.set(it.x, it.y, it.z); s.set(it.sx, it.sy, it.sz); m.compose(p, q, s); im.setMatrixAt(i, m); });
  im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); parent.add(im); return im;
}
// 논리 좌표 상자를 instanced 항목으로
export const boxItem = (x, y, w, h, H, f = 1, lift = 0) => { const c = W(x + w / 2, y + h / 2, f); return {x:c.x, y:c.y + lift + H / 2, z:c.z, sx:w, sy:H, sz:h}; };

export function addTo(f, m){ (f === "scene" ? scene : G[f]).add(m); return m; }
export function box(f, x, y, w, h, H, color, lift = 0, material){
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, H, h), material || mat(color));
  m.position.copy(W(x + w / 2, y + h / 2, f)); m.position.y += lift + H / 2;
  m.castShadow = m.receiveShadow = true; return addTo(f, m);
}
export function cyl(f, x, y, r, H, color, lift = 0, r2 = r, seg = 20){
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r2, H, seg), mat(color));
  m.position.copy(W(x, y, f)); m.position.y += lift + H / 2; m.castShadow = m.receiveShadow = true; return addTo(f, m);
}
export function ball(f, x, y, r, color, lift = 0, sy = 1, o){
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), mat(color, o)); m.scale.y = sy;
  m.position.copy(W(x, y, f)); m.position.y += lift; m.castShadow = true; return addTo(f, m);
}
export function plane(f, x, y, w, h, color, lift = .5){
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat(color));
  m.rotation.x = -Math.PI / 2; m.position.copy(W(x + w / 2, y + h / 2, f)); m.position.y += lift; m.receiveShadow = true; return addTo(f, m);
}
// 클릭 판정용 보이지 않는 상자 (합치기에서 빠져요)
export function hitBox(f, x, y, w, h, H, lift = 0){
  const m = box(f, x, y, w, h, H, null, lift, HITMAT); m.castShadow = m.receiveShadow = false; m.userData.dyn = true; return m;
}
// 글자를 그려 넣는 판. 내용(인자)이 바뀔 때만 다시 그리고 GPU로 올려요.
export function canvasPanel(f, w, h, draw, px = 4){
  const cv = document.createElement("canvas"); cv.width = w * px; cv.height = h * px;
  const ctx = cv.getContext("2d"); const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
  let last = null, args = [];
  m.redraw = (...a) => { const key = JSON.stringify(a); if (key === last) return false; last = key; args = a; ctx.setTransform(px, 0, 0, px, 0, 0); draw(ctx, w, h, ...a); tex.needsUpdate = true; return true; };
  m.refresh = () => { last = null; m.redraw(...args); };
  PANELS.push(m); m.redraw(); return addTo(f, m);
}
// 웹 글꼴이 늦게 도착하면 글자판을 한 번 다시 그려요 (처음엔 기본 글꼴로 그려졌을 수 있어서)
const PANELS = [];
document.fonts?.ready.then(() => PANELS.forEach(m => m.refresh()));
export const placeAt = (m, x, y, f, h) => { m.position.copy(W(x, y, f)); m.position.y += h; return m; };
export function label(f, text, x, y, H, cls = "rlab"){
  const d = document.createElement("div"); d.className = cls; d.textContent = text;
  const o = new CSS2DObject(d); o.position.copy(W(x, y, f)); o.position.y += H; scene.add(o); LABELS[f].push(o); return o;
}
export function plant(f, x, y, big = false){
  cyl(f, x, y, big ? 14 : 10, big ? 22 : 16, "#c98b5e", 0, big ? 11 : 8);
  const g = new THREE.Mesh(new THREE.IcosahedronGeometry(big ? 24 : 16, 1), mat("#7cc29a"));
  placeAt(g, x, y, f, (big ? 22 : 16) + (big ? 20 : 13)); g.castShadow = true; addTo(f, g); return g;
}
export function sofa(f, x, y, w, col = "#ff9fb8"){
  box(f, x, y, w, 42, 22, col); box(f, x, y + 30, w, 12, 50, col); box(f, x, y, 14, 42, 34, col); box(f, x + w - 14, y, 14, 42, 34, col);
  for (let i = 0; i < Math.round(w / 50); i++) box(f, x + 18 + i * 42, y + 15, 34, 12, 12, "#fff3f6", 22);
}
// 공유 상태 (world.js와 app.js가 함께 봐요)
export const state = { broken: {} };
