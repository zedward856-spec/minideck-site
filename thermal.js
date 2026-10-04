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
function drawSlice() {
  if (!field) return;
  const [w, h, cell] = sliceDims(), c = $("#slice");
  c.width = w; c.height = h;
  const g = c.getContext("2d"), img = g.createImageData(w, h);
  for (let v = 0; v < h; v++) for (let u = 0; u < w; u++) {
    const [i, j, k] = cell(u, v), t = T(i, j, k), p = P(i, j, k);
    let [r, gg, b] = cmap((t - 25) / (scaleMax - 25));
    // part outlines
    const [i2, j2, k2] = cell(Math.min(w - 1, u + 1), v), [i3, j3, k3] = cell(u, Math.min(h - 1, v + 1));
    if (P(i2, j2, k2) !== p || P(i3, j3, k3) !== p) { r *= 0.45; gg *= 0.45; b *= 0.45; }
    const o = (v * w + u) * 4; img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const coord = lo[ax] + pos + 0.5, name = ["x", "y", "z"][ax];
  $("#slicelabel").textContent = `${name} = ${coord.toFixed(1)} mm`;
}
$("#slice").addEventListener("mousemove", (e) => {
  if (!field) return;
  const c = $("#slice"), rc = c.getBoundingClientRect(), [w, h, cell] = sliceDims();
  const u = Math.floor(((e.clientX - rc.left) / rc.width) * w), v = Math.floor(((e.clientY - rc.top) / rc.height) * h);
  if (u < 0 || v < 0 || u >= w || v >= h) return;
  const [i, j, k] = cell(u, v), tip = $("#tip");
  tip.style.display = "block";
  tip.textContent = `${T(i, j, k).toFixed(1)} °C · ${IDX.parts[P(i, j, k)]} · (${(lo[0] + i + .5).toFixed(0)}, ${(lo[1] + j + .5).toFixed(0)}, ${(lo[2] + k + .5).toFixed(0)}) mm`;
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
  g.scene.traverse((o) => { if (o.isMesh) o.material = new THREE.MeshBasicMaterial({ color: 0x9aa0a8, transparent: true, opacity: 0.07, depthWrite: false }); });
  caseFrame.add(g.scene);
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
