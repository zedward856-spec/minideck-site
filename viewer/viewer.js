// Minideck viewer: the deck on its own, every part toggleable (same idea as the Android app).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";

const $ = (s) => document.querySelector(s);
const ASSET_V = new URL(import.meta.url).searchParams.get("v") || "0";
const A = (f) => `../assets/${f}?v=${ASSET_V}`;
const mobile = () => innerWidth < 860;

// same palettes / electronics colours as the main page
const PALETTES = [
  { name: "Cyber yellow", body: "#2d2d2d", kbplate: "#3d3d3d", accent: "#f7d116", accent2: "#f7d116", keys: "#161616", glow: 0.0 },
  { name: "Neon night", body: "#0d0d12", kbplate: "#22232c", accent: "#05d9e8", accent2: "#ff2a6d", keys: "#161618", glow: 0.6 },
  { name: "Arasaka", body: "#111214", kbplate: "#3b3d42", accent: "#e0102a", accent2: "#e0102a", keys: "#161618", glow: 0.2 },
  { name: "Snow", body: "#e7e6e1", kbplate: "#f6f6f3", accent: "#ff5a10", accent2: "#ff5a10", keys: "#f2f2f0", glow: 0.0 },
  { name: "Retro beige", body: "#d6c9a8", kbplate: "#bfb08c", accent: "#7a1f2b", accent2: "#7a1f2b", keys: "#8e9093", glow: 0.0 },
  { name: "Field olive", body: "#4b5320", kbplate: "#b8a77c", accent: "#1a1a1a", accent2: "#1a1a1a", keys: "#161618", glow: 0.0 },
];
const FIXED = {
  pcb_green: ["#1f7a45", 0.5, 0.1], pcb_red: ["#a3232a", 0.5, 0.1], pcb_purple: ["#4b2a8a", 0.5, 0.1],
  pcb_blue: ["#1e4fc0", 0.5, 0.1], metal: ["#c9cacc", 0.32, 0.9], brass: ["#c8a03c", 0.35, 0.9],
  cell: ["#2f5fd0", 0.35, 0.2], flex: ["#d39a1c", 0.45, 0.1], dark: ["#1d1d1f", 0.45, 0.2],
  glass: ["#04060a", 0.08, 0.3], ceramic: ["#e6e6dc", 0.7, 0.0], sdcard: ["#0d0d0f", 0.28, 0.25],
};
const CASE_ROLES = ["body", "kbplate", "accent", "accent2", "fill", "fill_dark"];
// what each part does (shown when you click it)
const INFO = {
  bottom: "Printed case bottom: holds the boards, battery tube and the NFC mark underneath.",
  box_hatch: "Printed hatch over the hinge box.", keyboard_top: "Printed keyboard plate with the logo inlay.",
  battery_door: "Printed swing door over the 18650 chamber.", door_lock: "Printed C-clip that locks the battery door.",
  hinge_cap: "Printed cap over the friction hinge.", hinge_axle: "Hollow printed axle: HDMI and power run through it to the lid.",
  torque_hinge: "Friction torque hinge: holds the lid at any angle 0–180°.",
  keyboard: "M5Stack CardKB, I²C keyboard.", radxa: "Radxa ZERO 3W, RK3566 quad-core computer, Wi-Fi + BT.",
  "18650": "Protected high-drain 18650 Li-ion cell, swappable.", pn532: "PN532 NFC reader (13.56 MHz, I²C).",
  dac: "PCM5102 I²S audio DAC.", mt3608: "Pololu U3V40F5 5 V boost, 2.6 A.", tp4056: "TP4056 USB-C charger with protection.",
  lora: "Ebyte E22-900T22S LoRa radio (UART).", gps_module: "ATGM336H GPS (UART), standing on its edge.",
  sdr_dongle: "NESDR Nano 2+ software-defined radio (USB).", antenna_lora: "Flexible LoRa antenna (u.FL).",
  antenna_wifi: "Flexible Wi-Fi/BT antenna (u.FL).", antenna_sdr: "Flexible SDR antenna (u.FL).",
  switch_knob: "Printed flush power-switch knob, fitted from inside.", power_switch: "SS12D00 slide switch: battery on/off.",
  m2_hardware: "M2 heat-set inserts in the case.", screen_back: "Printed lid shell.", screen_front: "Printed screen bezel.",
  screen_panel: 'EP28060S 2.8" IPS display.', driver_board: "EHD-40P-V3 HDMI display driver.",
  gps_patch_antenna: "Taoglas ceramic GPS patch antenna, in the lid.", lid_inserts: "M2 heat-set inserts in the lid.",
  sdcard: "microSD with the OS, under the keyboard plate.", keycaps: "Silicone keycaps.",
  screws_base_: "M2 × 4 hex screws holding the case together.", screws_lid_: "M2 screws holding the bezel on.",
};

// ------------------------------------------------------------------ renderer / scene
const canvas = $("#stage");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 1, 3000);
const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(-120, 220, 160); scene.add(key);
const rimL = new THREE.PointLight(0xfff6e8, 5000, 600, 1.6); rimL.position.set(-160, 60, -140); scene.add(rimL);
const rimR = new THREE.PointLight(0xe8f0ff, 4000, 600, 1.6); rimR.position.set(170, 40, -120); scene.add(rimR);
scene.add(new THREE.HemisphereLight(0xbfc6d0, 0x0a0a0c, 0.6));

// faint floor grid under the deck
const grid = new THREE.GridHelper(600, 60, 0xf7d116, 0xf7d116);
grid.material.transparent = true; grid.material.opacity = 0.07; grid.position.y = -0.5; scene.add(grid);

const controls = new OrbitControls(camera, canvas);
Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, rotateSpeed: 0.8, zoomSpeed: 1.1, panSpeed: 0.8,
  screenSpacePanning: true, autoRotateSpeed: 1.2 });
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

const caseFrame = new THREE.Group(); caseFrame.rotation.x = -Math.PI / 2; scene.add(caseFrame);

const mats = {};
function mat(role) {
  if (mats[role]) return mats[role];
  let m;
  if (FIXED[role]) { const [c, r, mt] = FIXED[role]; m = new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: mt }); }
  else m = new THREE.MeshStandardMaterial({ color: "#2d2d2d", roughness: role === "keys" ? 0.85 : 0.62, metalness: 0 });
  if (role === "fill" || role === "fill_dark") Object.assign(m, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.userData.role = role;
  return (mats[role] = m);
}

// ------------------------------------------------------------------ state (remembered per browser)
const store = { get(k, d) { try { const v = localStorage.getItem("minideck.viewer." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("minideck.viewer." + k, JSON.stringify(v)); } catch (e) { } } };
let hidden = new Set(store.get("hidden", []));
let palIndex = store.get("pal", 0) % PALETTES.length;
let xray = false;

function setPalette(i) {
  const P = PALETTES[i]; palIndex = i; store.set("pal", i);
  const col = { body: P.body, kbplate: P.kbplate, accent: P.accent, accent2: P.accent2, keys: P.keys, fill: P.accent, fill_dark: P.body };
  for (const r in col) {
    const m = mat(r); m.color.set(col[r]);
    m.emissive.copy(r.startsWith("accent") || r === "fill" ? m.color : new THREE.Color(0)).multiplyScalar(P.glow * 0.35);
  }
  document.querySelectorAll("#swatches button").forEach((b, k) => b.classList.toggle("on", k === i));
  $("#palName").textContent = `${i + 1} — ${P.name}`;
  if (selected) select(selected);                  // refresh the highlight copies
}
PALETTES.forEach((P, i) => {
  const b = document.createElement("button"); b.title = P.name;
  b.innerHTML = `<i style="background:linear-gradient(135deg, ${P.body} 0 55%, ${P.accent} 55% 78%, ${P.accent2} 78%)"></i>`;
  b.onclick = () => setPalette(i);
  $("#swatches").appendChild(b);
});

function setXray(v) {
  xray = v; $("#xray").classList.toggle("on", v);
  for (const r of CASE_ROLES) {
    const m = mat(r);
    Object.assign(m, { transparent: v, opacity: v ? 0.13 : 1, depthWrite: !v }); m.needsUpdate = true;
  }
  if (selected) select(selected);
}
$("#xray").onclick = () => setXray(!xray);
$("#spin").onclick = () => { controls.autoRotate = !controls.autoRotate; $("#spin").classList.toggle("on", controls.autoRotate); };

// ------------------------------------------------------------------ lid + explode
let lidNode = null, lidDeg = 110, explodeAmt = 0;
const parts = [];
function setLid(d) { lidDeg = d; $("#lid").value = d; $("#lidOut").textContent = d + "°"; if (lidNode) lidNode.rotation.x = -THREE.MathUtils.degToRad(d); }
function setExplode(p) { explodeAmt = p; $("#explode").value = p * 100; $("#explodeOut").textContent = Math.round(p * 100) + "%"; placeParts(); }
$("#lid").oninput = (e) => setLid(+e.target.value);
$("#explode").oninput = (e) => setExplode(+e.target.value / 100);

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const q = new THREE.Quaternion();
// the site's collision-free teardown plan (plan_explode.py): each part slides out along its free
// direction, then turns once it is clear
function placeParts() {
  for (const P of parts) {
    const p = P.plan, u = clamp((explodeAmt - p.t0) / (p.t1 - p.t0));
    const d = u * u * (3 - 2 * u) * p.dist;
    P.pivot.position.copy(P.centre).addScaledVector(P.dir, d);
    const out = clamp((d - p.clear) / Math.max(1, p.dist - p.clear));
    P.pivot.quaternion.setFromAxisAngle(P.axis, p.tumble.ang * out * out * (3 - 2 * out));
  }
}

function pivotize(obj) {
  const parent = obj.parent;
  parent.updateMatrixWorld(true);
  const c = new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3());
  parent.worldToLocal(c);
  const pivot = new THREE.Group(); pivot.position.copy(c); parent.add(pivot);
  obj.position.sub(c); pivot.add(obj);
  return { pivot, centre: c.clone() };
}

// ------------------------------------------------------------------ camera framing (panel-aware)
let home = null;
function viewOffset() {
  const w = innerWidth, h = innerHeight;
  camera.aspect = w / h;
  if (mobile()) camera.clearViewOffset();
  else camera.setViewOffset(w, h, 180, 0, w, h);    // keep the deck centred in the space left of the panel
  camera.updateProjectionMatrix();
}
function frameDeck(root) {
  scene.updateMatrixWorld(true);
  const sphere = new THREE.Box3().setFromObject(root).getBoundingSphere(new THREE.Sphere());
  const free = mobile() ? 1 : (innerWidth - 360) / innerWidth;
  const vf = THREE.MathUtils.degToRad(camera.fov) / 2, hf = Math.atan(Math.tan(vf) * camera.aspect * free);
  const dist = (sphere.radius / Math.sin(Math.min(vf, hf))) * 1.12;
  const dir = new THREE.Vector3(-0.55, 0.5, 1).normalize();
  home = { target: sphere.center.clone(), pos: sphere.center.clone().addScaledVector(dir, dist) };
  controls.minDistance = sphere.radius * 0.15; controls.maxDistance = dist * 4;
  grid.position.y = new THREE.Box3().setFromObject(root).min.y - 0.3;
}
function resetView() { controls.target.copy(home.target); camera.position.copy(home.pos); controls.update(); }
$("#resetBtn").onclick = () => home && resetView();

// ------------------------------------------------------------------ load
let items = [], selected = null, root = null;
async function load() {
  const meta = await (await fetch(A("parts.json"))).json();
  const gltf = await new GLTFLoader().loadAsync(A("minideck.glb"), (e) => {
    if (e.total) $("#loadpct").textContent = Math.round((e.loaded / e.total) * 100) + "%";
  });
  root = gltf.scene; caseFrame.add(root);
  lidNode = root.getObjectByName("lid");
  root.updateMatrixWorld(true);

  root.traverse((o) => {
    if (!o.isMesh) return;
    let n = o.name, m = meta[n];
    for (let p = o; !m && p; p = p.parent) { n = p.name; m = meta[n]; }
    if (m && m.role === "native") {
      const c = new THREE.Color((m.colours && m.colours[o.name]) || "#808080");
      const grey = Math.abs(c.r - c.g) < 0.04 && Math.abs(c.g - c.b) < 0.06 && c.r > 0.55;
      const gold = c.r > 0.7 && c.g > 0.45 && c.b < 0.45 && c.r - c.b > 0.3;
      o.material = new THREE.MeshStandardMaterial({ color: c, roughness: grey || gold ? 0.32 : 0.55, metalness: grey || gold ? 0.75 : 0.08 });
    } else o.material = mat(m ? m.role : "body");
    o.geometry = toCreasedNormals(o.geometry, THREE.MathUtils.degToRad(35));
    o.userData.base = o.material;
  });

  // every part with a teardown plan gets its own pivot
  const pivots = {};
  for (const n of Object.keys(meta)) {
    if (n.startsWith("_") || !meta[n].plan) continue;
    const obj = root.getObjectByName(n); if (!obj) continue;
    const { pivot, centre } = pivotize(obj);
    const pl = meta[n].plan;
    pivots[n] = pivot;
    parts.push({ pivot, centre, plan: pl, dir: new THREE.Vector3(...pl.dir), axis: new THREE.Vector3(...pl.tumble.axis).normalize() });
  }
  const holder = (n) => pivots[n] || root.getObjectByName(n);
  // paint fills, inserts, keycaps ride with their host
  for (const n of Object.keys(meta)) {
    const h = meta[n].host && holder(meta[n].host), obj = root.getObjectByName(n);
    if (h && obj) h.attach(obj);
  }
  // keycap legends
  const L = meta.legends, kb = holder("keyboard");
  let legendPlane = null;
  if (L && kb) {
    const tex = await new THREE.TextureLoader().loadAsync(A("legends.png"));
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const [x0, y0, x1, y1] = L.rect;
    legendPlane = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0),
      new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    legendPlane.position.set((x0 + x1) / 2, (y0 + y1) / 2, L.z + 0.12);
    root.add(legendPlane); (holder("keycaps") || kb).attach(legendPlane);
  }
  // the Optic animation on the screen
  const S = meta._screen;
  const video = Object.assign(document.createElement("video"), { src: A("screen.mp4"), muted: true, loop: true, playsInline: true, autoplay: true });
  video.setAttribute("playsinline", ""); video.play().catch(() => {});
  addEventListener("pointerdown", () => video.paused && video.play().catch(() => {}));
  const vt = new THREE.VideoTexture(video); vt.colorSpace = THREE.SRGBColorSpace;
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(S.w, S.h), new THREE.MeshBasicMaterial({ map: vt, toneMapped: false }));
  scr.rotation.x = Math.PI; scr.position.set(S.cx, S.cy, S.z - 0.05);
  lidNode.add(scr); const sp = holder("screen_panel"); if (sp) sp.attach(scr);
  scr.userData.base = scr.material;

  // ---- the parts list: one row per listed part, loose screws as two rows
  for (const n of Object.keys(meta)) {
    const m = meta[n];
    if (n.startsWith("_") || !m.list) continue;
    items.push({ id: n, label: m.label, lid: m.lid, role: m.role, nodes: [holder(n)] });
  }
  for (const [pre, label, lid] of [["screws_base_", "M2 screws", false], ["screws_lid_", "Bezel screws", true]]) {
    const ns = Object.keys(meta).filter((n) => n.startsWith(pre));
    if (ns.length) items.push({ id: pre, label: `${label} ×${ns.length}`, lid, role: "metal", nodes: ns.map(holder) });
  }
  for (const it of items) {
    it.nodes = it.nodes.filter(Boolean);
    if (it.id === "keycaps" && legendPlane && !it.nodes.includes(legendPlane.parent)) it.nodes.push(legendPlane);
    for (const o of it.nodes) o.userData.item = it;
    // size of the part in mm (case frame), shown in the selection card
    const b = new THREE.Box3();
    const one = it.nodes[0]; one.updateMatrixWorld(true); b.expandByObject(one);
    const s = b.getSize(new THREE.Vector3());
    it.size = [s.x, s.z, s.y].map((v) => v.toFixed(1)).join(" × ");   // world (Y up) back to W × D × H
  }
  buildList();
  setPalette(palIndex);
  setLid(110);
  viewOffset(); frameDeck(root); resetView();
  window.__viewer = { scene, camera, controls, items, root };
}

// ------------------------------------------------------------------ parts list UI
const GROUPS = [
  ["Case", (it) => CASE_ROLES.includes(it.role) || it.role === "keys"],
  ["Electronics", (it) => ["native", "dark", "sdcard"].includes(it.role) && !/inserts/i.test(it.label)],
  ["Hardware", () => true],
];
const rows = new Map();
function buildList() {
  const list = $(".ps-list");
  const grouped = GROUPS.map(([g]) => [g, []]);
  for (const it of items) grouped[GROUPS.findIndex(([, f]) => f(it))][1].push(it);
  for (const [g, its] of grouped) {
    if (!its.length) continue;
    const sec = document.createElement("section");
    sec.innerHTML = `<h4><span>${g}</span><button>toggle</button></h4>`;
    sec.querySelector("button").onclick = () => {
      const anyOn = its.some((it) => !hidden.has(it.id));
      for (const it of its) anyOn ? hidden.add(it.id) : hidden.delete(it.id);
      refresh();
    };
    for (const it of its) {
      const row = document.createElement("label");
      row.className = "ps-row";
      row.innerHTML = `<span>${it.label}${it.lid ? ' <i>lid</i>' : ""}</span><input type="checkbox"><s></s>`;
      row.querySelector("input").onchange = (e) => { e.target.checked ? hidden.delete(it.id) : hidden.add(it.id); refresh(); };
      row.querySelector("span").onclick = (e) => { e.preventDefault(); select(it); };   // the name selects, the switch toggles
      sec.appendChild(row); rows.set(it, row);
    }
    list.appendChild(sec);
  }
  const PRESET = { all: () => false, none: () => true, elec: (it) => !GROUPS[1][1](it), case: (it) => !GROUPS[0][1](it) };
  document.querySelectorAll(".ps-presets button").forEach((b) => b.onclick = () => {
    hidden = new Set(items.filter(PRESET[b.dataset.p]).map((it) => it.id)); refresh();
  });
  refresh();
}
function refresh() {
  for (const [it, row] of rows) {
    const on = !hidden.has(it.id);
    row.querySelector("input").checked = on;
    for (const o of it.nodes) o.visible = on;
  }
  const off = items.filter((it) => hidden.has(it.id)).length;
  $("#partsCount").textContent = `${items.length - off}/${items.length}`;
  if (selected && hidden.has(selected.id)) select(null);
  store.set("hidden", [...hidden]);
}

// ------------------------------------------------------------------ select / hover
function highlight(it, on) {
  for (const n of it.nodes) n.traverse((o) => {
    if (!o.userData.base) return;
    if (!on) { o.material = o.userData.base; return; }
    const m = o.userData.base.clone();
    if (m.emissive) { m.emissive.set("#f7d116"); m.emissiveIntensity = 0.28; }
    Object.assign(m, { transparent: false, opacity: 1, depthWrite: true });   // stays solid even in x-ray
    o.material = m;
  });
}
function select(it) {
  if (selected) { highlight(selected, false); rows.get(selected)?.classList.remove("sel"); }
  selected = it;
  $("#pick").hidden = !it;
  if (!it) return;
  highlight(it, true); rows.get(it)?.classList.add("sel");
  $("#pickName").textContent = it.label;
  $("#pickInfo").textContent = `${INFO[it.id] || ""}${INFO[it.id] ? " · " : ""}${it.nodes.length > 1 ? "each " : ""}${it.size} mm`;
}
$("#pickX").onclick = () => select(null);
$("#pickHide").onclick = () => { if (selected) { hidden.add(selected.id); refresh(); } };
$("#pickSolo").onclick = () => { if (selected) { const s = selected; hidden = new Set(items.filter((i) => i !== s).map((i) => i.id)); refresh(); select(s); } };

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function itemAt(e) {
  if (!root) return null;
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  for (const h of ray.intersectObject(root, true)) {
    let vis = true, it = null;
    for (let p = h.object; p; p = p.parent) { if (!p.visible) vis = false; if (!it && p.userData.item) it = p.userData.item; }
    if (!vis || !it) continue;
    if (xray && h.object.material.transparent && it !== selected) continue;   // x-ray: click through the case
    return it;
  }
  return null;
}
let down = null;
canvas.addEventListener("pointerdown", (e) => { down = [e.clientX, e.clientY]; });
canvas.addEventListener("pointerup", (e) => {
  if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 5) {
    const it = itemAt(e); select(it && it === selected ? null : it);
  }
  down = null;
});
const tip = $("#tip");
let hoverQ = null;
canvas.addEventListener("pointermove", (e) => {
  if (e.pointerType !== "mouse" || e.buttons) { tip.style.display = "none"; return; }
  hoverQ = e;
});
canvas.addEventListener("pointerleave", () => { hoverQ = null; tip.style.display = "none"; });
function hover() {
  if (!hoverQ) return;
  const e = hoverQ; hoverQ = null;
  const it = itemAt(e);
  tip.style.display = it ? "block" : "none";
  canvas.style.cursor = it ? "pointer" : "";
  if (it) { tip.textContent = it.label; tip.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 12}px)`; tip.style.left = tip.style.top = "0"; }
}

// mobile: the controls live in a bottom sheet
$("#sideBtn").onclick = () => { const o = $("#side").classList.toggle("open"); $("#sideBtn").classList.toggle("on", o); };

// ------------------------------------------------------------------ loop
function frame() {
  requestAnimationFrame(frame);
  controls.update();
  const d = camera.position.distanceTo(controls.target);
  camera.near = Math.max(0.5, d * 0.05); camera.far = d * 10 + 800; camera.updateProjectionMatrix();
  hover();
  renderer.render(scene, camera);
}
addEventListener("resize", () => { renderer.setSize(innerWidth, innerHeight); viewOffset(); });

load().then(() => { document.body.classList.remove("loading"); requestAnimationFrame(frame); })
  .catch((e) => { console.error(e); $("#loadpct").textContent = "load error"; });
