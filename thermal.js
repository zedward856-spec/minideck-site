import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const $ = (s) => document.querySelector(s);
const V = new URL(import.meta.url).searchParams.get("v") || "0";
const LOADS = { "typical": "typical use", "typical+charging": "typical + charging", "heavy": "heavy (SDR + Wi-Fi + CPU)", "heavy+charging": "heavy + charging" };

// inferno colour map
const STOPS = [[0, 0, 4], [31, 12, 72], [85, 15, 109], [136, 34, 106], [186, 54, 85], [227, 89, 51], [249, 140, 10], [249, 201, 50], [252, 255, 164]];
function cmap(t) {
  t = Math.min(1, Math.max(0, t)) * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(t)), f = t - i, a = STOPS[i], b = STOPS[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

let IDX, PARTS, nx, ny, nz, lo;
const cache = {};
let load = "heavy", run = null, field = null, ax = 2, pos = 21, scaleMax = 100;

async function getRun(r) {
  if (!cache[r.file]) cache[r.file] = new Uint8Array(await (await fetch(`thermal/${r.file}?v=${V}`)).arrayBuffer());
  return cache[r.file];
}
const T = (i, j, k) => run.lo + field[(i * ny + j) * nz + k] * run.step;
const P = (i, j, k) => PARTS[(i * ny + j) * nz + k];

// ---------------------------------------------------------------- UI
function runsFor(l) { return IDX.runs.filter((r) => r.scenario === l); }
function baseFor(l) { return runsFor(l).find((r) => r.option.startsWith("current")); }

function buildLoads() {
  $("#loads").innerHTML = Object.entries(LOADS).map(([k, v]) => `<button data-l="${k}" class="${k === load ? "on" : ""}">${v}</button>`).join("");
  $("#loads").querySelectorAll("button").forEach((b) => (b.onclick = () => { load = b.dataset.l; buildLoads(); buildOptions(); }));
}
function buildOptions() {
  const rs = runsFor(load);
  scaleMax = Math.max(...rs.map((r) => r.soc)) + 2;
  $("#thr").max = Math.ceil(scaleMax);
  const b0 = baseFor(load); $("#thr").value = Math.round(b0.air + (scaleMax - b0.air) * 0.3);   // just above the inside air: hot spots
  $("#option").innerHTML = rs.map((r) => `<option value="${r.file}">${r.option}</option>`).join("");
  const keep = rs.find((r) => run && r.option === run.option) || rs[0];
  $("#option").value = keep.file;
  select(keep);
}
$("#option").onchange = () => select(IDX.runs.find((r) => r.file === $("#option").value));
$("#axes").querySelectorAll("button").forEach((b) => (b.onclick = () => {
  $("#axes").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
  ax = +b.dataset.ax; const n = [nx, ny, nz][ax];
  $("#pos").max = n - 1; pos = ax === 2 ? Math.round(17.5 - lo[2]) : ax === 1 ? Math.round(20 - lo[1]) : Math.round(75 - lo[0]);
  $("#pos").value = pos; drawSlice();
}));
$("#pos").oninput = () => { pos = +$("#pos").value; drawSlice(); };
$("#thr").oninput = () => { $("#thrlabel").textContent = `${$("#thr").value} °C`; rebuildPoints(); };

async function select(r) {
  run = r; field = await getRun(r);
  $("#option").value = r.file;
  drawStats(); drawBars(); drawSlice(); drawLegend(); rebuildPoints();
}

function drawStats() {
  const b = baseFor(load), charging = load.includes("charging");
  const items = [["SoC", "soc", 85], ["battery", "cell", charging ? 45 : 60], ["SDR", "sdr", 85], ["inside air", "air", 60],
                 ["hottest case surface", "surface", 55]];
  $("#stats").innerHTML = items.map(([lab, key, lim]) => {
    const v = run[key], d = v - b[key];
    const delta = run === b ? "" : `<i class="${d <= 0 ? "good" : "bad"}">${d > 0 ? "+" : ""}${d.toFixed(0)}</i>`;
    return `<div class="stat ${v > lim ? "warn" : ""}"><b>${v.toFixed(0)}°${delta}</b><span>${lab}${v > lim ? ` · over ${lim}°` : ""}</span></div>`;
  }).join("") + `<div class="stat"><b>${run.watts.toFixed(1)} W</b><span>heat inside${run.airflow_lps > 0.001 ? ` · ${run.airflow_lps.toFixed(2)} L/s air` : ""}</span></div>`;
}

function drawBars() {
  const rs = runsFor(load), mx = Math.max(...rs.map((r) => Math.max(r.soc, r.cell, r.sdr)));
  const bar = (v) => { const c = cmap((v - 25) / (scaleMax - 25)); return `<div class="track"><i style="width:${((v - 25) / (mx - 25)) * 100}%;background:rgb(${c.map(Math.round)})"></i><em>${v.toFixed(0)}°</em></div>`; };
  $("#bars").innerHTML = `<div class="bar hdr"><span>option</span><span>SoC</span><span>battery</span><span>SDR</span></div>` +
    rs.map((r) => `<div class="bar ${r === run ? "on" : ""}" data-f="${r.file}"><span>${r.option}</span>${bar(r.soc)}${bar(r.cell)}${bar(r.sdr)}</div>`).join("");
  $("#bars").querySelectorAll(".bar[data-f]").forEach((el) => (el.onclick = () => select(IDX.runs.find((r) => r.file === el.dataset.f))));
}

function drawLegend() {
  const c = $("#legend"); c.width = 256; const g = c.getContext("2d");
  for (let x = 0; x < 256; x++) { const [r, gg, b] = cmap(x / 255); g.fillStyle = `rgb(${r | 0},${gg | 0},${b | 0})`; g.fillRect(x, 0, 1, 14); }
  $("#lmin").textContent = "25 °C"; $("#lmax").textContent = `${scaleMax.toFixed(0)} °C`;
}

// ---------------------------------------------------------------- slice
function sliceDims() {   // image (w, h) and the cell under pixel (u, v); v = 0 is the top row of the image
  if (ax === 2) return [nx, ny, (u, v) => [u, ny - 1 - v, pos]];     // top view: back of the deck at the top
  if (ax === 1) return [nx, nz, (u, v) => [u, pos, nz - 1 - v]];     // front view
  return [ny, nz, (u, v) => [pos, u, nz - 1 - v]];                   // side view (from the left)
}
const S = 8;                                   // slice drawn at 8 px per mm, temperatures blended between cells
let TRIS = null;                               // every triangle of the base parts (case mm), for crisp outlines
function sliceT() {                            // temperatures of the current slice, w x h, row 0 = top
  const [w, h, cell] = sliceDims(), out = new Float32Array(w * h);
  for (let v = 0; v < h; v++) for (let u = 0; u < w; u++) { const [i, j, k] = cell(u, v); out[v * w + u] = T(i, j, k); }
  return [w, h, out];
}
function bilerp(ts, w, h, uc, vc) {
  const u0 = Math.max(0, Math.min(w - 1, Math.floor(uc))), v0 = Math.max(0, Math.min(h - 1, Math.floor(vc)));
  const u1 = Math.min(w - 1, u0 + 1), v1 = Math.min(h - 1, v0 + 1);
  const fu = Math.max(0, Math.min(1, uc - u0)), fv = Math.max(0, Math.min(1, vc - v0));
  return (ts[v0 * w + u0] * (1 - fu) + ts[v0 * w + u1] * fu) * (1 - fv) + (ts[v1 * w + u0] * (1 - fu) + ts[v1 * w + u1] * fu) * fv;
}
function toPx(p) {                             // case-mm point -> slice pixel (u right, v down)
  if (ax === 2) return [(p[0] - lo[0]) * S, (ny - (p[1] - lo[1])) * S];
  if (ax === 1) return [(p[0] - lo[0]) * S, (nz - (p[2] - lo[2])) * S];
  return [(p[1] - lo[1]) * S, (nz - (p[2] - lo[2])) * S];
}
const LUT = new Uint8Array(1024 * 3);
for (let q = 0; q < 1024; q++) { const c = cmap(q / 1023); LUT[q * 3] = c[0]; LUT[q * 3 + 1] = c[1]; LUT[q * 3 + 2] = c[2]; }
function drawSlice() {
  if (!field) return;
  const [w, h, ts] = sliceT(), c = $("#slice"), W = w * S, H = h * S;
  c.width = W; c.height = H;
  const g = c.getContext("2d"), img = g.createImageData(W, H), d = img.data, span = scaleMax - 25;
  for (let py = 0; py < H; py++) {
    const vc = (py + 0.5) / S - 0.5;
    for (let px = 0; px < W; px++) {
      const t = bilerp(ts, w, h, (px + 0.5) / S - 0.5, vc), o = (py * W + px) * 4;
      const q = Math.max(0, Math.min(1023, Math.round(((t - 25) / span) * 1023))) * 3;
      d[o] = LUT[q]; d[o + 1] = LUT[q + 1]; d[o + 2] = LUT[q + 2]; d[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  if (TRIS) {                                  // where the real part surfaces cross the slice plane
    const cpl = lo[ax] + pos + 0.5, segs = [];
    for (let t = 0; t < TRIS.length; t += 9) {
      const da = TRIS[t + ax] - cpl, db = TRIS[t + 3 + ax] - cpl, dc = TRIS[t + 6 + ax] - cpl;
      if ((da > 0 && db > 0 && dc > 0) || (da < 0 && db < 0 && dc < 0)) continue;
      const P3 = [[TRIS[t], TRIS[t + 1], TRIS[t + 2], da], [TRIS[t + 3], TRIS[t + 4], TRIS[t + 5], db], [TRIS[t + 6], TRIS[t + 7], TRIS[t + 8], dc]];
      const hit = [];
      for (let e = 0; e < 3; e++) {
        const A = P3[e], B = P3[(e + 1) % 3];
        if ((A[3] > 0) !== (B[3] > 0)) { const f = A[3] / (A[3] - B[3]); hit.push([A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f]); }
      }
      if (hit.length === 2) segs.push(toPx(hit[0]), toPx(hit[1]));
    }
    const stroke = (style, width) => {
      g.beginPath();
      for (let s = 0; s < segs.length; s += 2) { g.moveTo(segs[s][0], segs[s][1]); g.lineTo(segs[s + 1][0], segs[s + 1][1]); }
      g.strokeStyle = style; g.lineWidth = width; g.stroke();
    };
    stroke("rgba(0,0,0,0.55)", 2.4); stroke("rgba(255,255,255,0.55)", 0.9);
  }
  const name = ["x", "y", "z"][ax];
  $("#slicelabel").textContent = `${name} = ${(lo[ax] + pos + 0.5).toFixed(1)} mm`;
}
$("#slice").addEventListener("mousemove", (e) => {
  if (!field) return;
  const c = $("#slice"), rc = c.getBoundingClientRect(), [w, h, cell] = sliceDims();
  const uc = ((e.clientX - rc.left) / rc.width) * w - 0.5, vc = ((e.clientY - rc.top) / rc.height) * h - 0.5;
  if (uc < -0.5 || vc < -0.5 || uc > w - 0.5 || vc > h - 0.5) return;
  const [, , ts] = sliceT(), t = bilerp(ts, w, h, uc, vc);
  const [i, j, k] = cell(Math.round(Math.max(0, Math.min(w - 1, uc))), Math.round(Math.max(0, Math.min(h - 1, vc)))), tip = $("#tip");
  tip.style.display = "block";
  tip.textContent = `${t.toFixed(1)} °C · ${IDX.parts[P(i, j, k)]} · (${(lo[0] + i + .5).toFixed(0)}, ${(lo[1] + j + .5).toFixed(0)}, ${(lo[2] + k + .5).toFixed(0)}) mm`;
  const pr = c.parentElement.getBoundingClientRect();
  tip.style.left = `${e.clientX - pr.left + 14}px`; tip.style.top = `${e.clientY - pr.top + 14}px`;
});
$("#slice").addEventListener("mouseleave", () => ($("#tip").style.display = "none"));

// ---------------------------------------------------------------- 3D
const box = $("#view3d");
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
box.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x050507);
const camera = new THREE.PerspectiveCamera(35, 4 / 3, 1, 2000);
camera.position.set(-90, 120, 170);
const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true;
scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 1.2));
const caseFrame = new THREE.Group(); caseFrame.rotation.x = -Math.PI / 2; caseFrame.position.set(-47, -13, 40); scene.add(caseFrame);
let points = null;
new GLTFLoader().load(`assets/minideck.glb?v=${V}`, (g) => {
  const lid = g.scene.getObjectByName("lid"); if (lid) lid.visible = false;
  g.scene.updateMatrixWorld(true);
  const tri = [], v3 = new THREE.Vector3();
  g.scene.traverse((o) => {
    if (!o.isMesh) return;
    o.material = new THREE.MeshBasicMaterial({ color: 0x9aa0a8, transparent: true, opacity: 0.07, depthWrite: false });
    for (let p = o; p; p = p.parent) if (p === lid) return;          // base parts only (the lid is open)
    if (o.name.startsWith("fill_")) return;
    const pos = o.geometry.attributes.position, ix = o.geometry.index;
    const n = ix ? ix.count : pos.count;
    for (let q = 0; q < n; q++) { v3.fromBufferAttribute(pos, ix ? ix.getX(q) : q).applyMatrix4(o.matrixWorld); tri.push(v3.x, v3.y, v3.z); }
  });
  TRIS = new Float32Array(tri);
  caseFrame.add(g.scene);
  drawSlice();
});
function rebuildPoints() {
  if (!field) return;
  if (points) { caseFrame.remove(points); points.geometry.dispose(); }
  const thr = +$("#thr").value, pos3 = [], col = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) {
    const t = T(i, j, k);
    if (t >= thr) {
      pos3.push(lo[0] + i + .5, lo[1] + j + .5, lo[2] + k + .5);
      const c = cmap((t - 25) / (scaleMax - 25)); col.push(c[0] / 255, c[1] / 255, c[2] / 255);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos3, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.6, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false }));
  caseFrame.add(points);
  $("#thrlabel").textContent = `${thr} °C · ${(pos3.length / 3).toLocaleString()} cells`;
}
function resize() { const w = box.clientWidth; renderer.setSize(w, w * 0.75); camera.aspect = 4 / 3; camera.updateProjectionMatrix(); }
addEventListener("resize", resize);
(function loop() { requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); })();

// ---------------------------------------------------------------- start
(async () => {
  IDX = await (await fetch(`thermal/index.json?v=${V}`)).json();
  [nx, ny, nz] = IDX.n; lo = IDX.lo;
  PARTS = new Uint8Array(await (await fetch(`thermal/parts.bin?v=${V}`)).arrayBuffer());
  $("#pos").max = nz - 1; pos = Math.round(17.5 - lo[2]); $("#pos").value = pos;
  resize(); buildLoads(); buildOptions();
})();
