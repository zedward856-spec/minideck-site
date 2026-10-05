// Minideck wiring page: power path (static SVG), Radxa header map and the wire list, from data.json
// (written by cad/site_wiring.py from the same plan as WIRING.md and the Obsidian canvases).
const $ = (s) => document.querySelector(s);
const KIND = { pwr: "5 V / battery +", gnd: "ground", v33: "3.3 V", i2c: "I²C", i2s: "I²S audio", uart: "UART",
  usb: "USB", gpio: "GPIO", hdmi: "HDMI", coax: "antenna coax" };
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");

fetch("data.json?v=" + (new URL(document.currentScript.src).searchParams.get("v") || "0")).then((r) => r.json()).then((D) => {
  const col = (k) => (k === "gnd" ? "#868e96" : D.colors[k] || "#888");
  const pinOf = (w) => { const m = /Radxa pin (\d+)/.exec(w.a + " " + w.b); return m ? +m[1] : null; };
  const pinKind = {};
  for (const w of D.wires) { const p = pinOf(w); if (p) pinKind[p] = w.kind; }
  for (const p in D.pins) if (!pinKind[p]) pinKind[p] = /GND/.test(D.pins[p].fn) ? "gnd" : /5V/.test(D.pins[p].fn) ? "pwr" : /3V3/.test(D.pins[p].fn) ? "v33" : "gpio";

  // ---- header: top row = even pins (board edge), bottom row = odd; pin 1 on the left
  const H = $("#header");
  const cell = (n) => {
    const d = document.createElement("div");
    const info = D.pins[n];
    d.className = "pin" + (info ? " used" : "");
    d.textContent = n;
    if (info) d.style.background = col(pinKind[n]);
    d.dataset.pin = n;
    return d;
  };
  const lbl = (n) => { const d = document.createElement("div"); d.className = "lbl"; const i = D.pins[n];
    d.textContent = i ? (i.wires[0] || "").replace(/ ?(->|<-).*/, "") : ""; d.title = i ? i.wires.join(", ") : ""; return d; };
  for (let c = 0; c < 20; c++) H.appendChild(lbl(2 * c + 2));
  for (let c = 0; c < 20; c++) H.appendChild(cell(2 * c + 2));
  for (let c = 0; c < 20; c++) H.appendChild(cell(2 * c + 1));
  for (let c = 0; c < 20; c++) H.appendChild(lbl(2 * c + 1));

  // ---- table
  const off = new Set();
  const kinds = [...new Set(D.wires.map((w) => w.kind))];
  for (const k of kinds) {
    const b = document.createElement("button");
    b.innerHTML = `<i style="background:${col(k)}"></i>${KIND[k] || k} <span class="dim">${D.wires.filter((w) => w.kind === k).length}</span>`;
    b.onclick = () => { off.has(k) ? off.delete(k) : off.add(k); b.classList.toggle("off", off.has(k)); draw(); };
    $("#chips").appendChild(b);
  }
  const rows = new Map();
  function draw() {
    const q = $("#q").value.trim().toLowerCase();
    const T = $("#table"); T.innerHTML = '<div class="row hdr"><span></span><span>wire</span><span>from</span><span>to</span><span>type / note</span></div>';
    rows.clear();
    let n = 0;
    for (const w of D.wires) {
      if (off.has(w.kind)) continue;
      if (q && !(w.name + " " + w.a + " " + w.b + " " + w.note + " " + (KIND[w.kind] || "")).toLowerCase().includes(q)) continue;
      const r = document.createElement("div"); r.className = "row";
      r.innerHTML = `<i style="background:${col(w.kind)}"></i><span class="n">${esc(w.name)}</span><span>${esc(w.a)}</span><span>${esc(w.b)}</span><span class="note">${esc(w.note)}</span>`;
      const p = pinOf(w);
      r.onmouseenter = () => light(p, w); r.onmouseleave = () => light(null);
      T.appendChild(r); rows.set(w, r); n++;
    }
    $("#wcount").textContent = n === D.wires.length ? n : `${n} of ${D.wires.length}`;
  }
  function light(p, w) {
    H.querySelectorAll(".pin.on").forEach((e) => e.classList.remove("on"));
    rows.forEach((r) => r.classList.remove("on"));
    if (!p) { $("#pinInfo").textContent = "hover a pin"; return; }
    const e = H.querySelector(`.pin[data-pin="${p}"]`); if (e) e.classList.add("on");
    const i = D.pins[p];
    $("#pinInfo").textContent = `pin ${p} · ${i ? i.fn : ""} · ${i ? i.wires.join(", ") : ""}`;
    for (const [wd, r] of rows) if (pinOf(wd) === p) r.classList.add("on");
  }
  H.addEventListener("mouseover", (e) => { const p = e.target.dataset && +e.target.dataset.pin; if (p && D.pins[p]) light(p); });
  H.addEventListener("mouseleave", () => light(null));
  H.addEventListener("click", (e) => { const p = +e.target.dataset.pin; if (p && D.pins[p]) { $("#q").value = "pin " + p; draw(); light(p); } });
  $("#q").addEventListener("input", draw);
  draw();

  for (const n of D.notes) { const li = document.createElement("li"); li.innerHTML = md(n); $("#notes").appendChild(li); }
});

const MAIL = ["zedward856", "gmail.com"].join("@");
const m2 = document.getElementById("mail2"); if (m2) { m2.href = "mailto:" + MAIL; m2.textContent = MAIL; }
