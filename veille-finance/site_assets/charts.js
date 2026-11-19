/* Graphiques de la veille : SVG/HTML natif, sans bibliothèque.
   Chaque graphique est un élément [data-chart="type"] contenant un <script type="application/json">. */
(function () {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const fr = (v, d = 1) => v == null ? "—" : v.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const sgn = (v, d = 1) => (v > 0 ? "+" : "") + fr(v, d);
  const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  const dlabel = (iso) => { const [y, m, d] = iso.split("-"); return `${+d} ${MOIS[+m - 1]} ${y}`; };
  const el = (tag, attrs = {}, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };
  const h = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };

  // Une seule infobulle partagée.
  const tip = h("div", "viz-tip"); tip.setAttribute("role", "status"); document.body.appendChild(tip);
  function showTip(html, x, y) {
    tip.innerHTML = html; tip.style.display = "block";
    const r = tip.getBoundingClientRect();
    let left = x + 14, top = y + 14;
    if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
    if (top + r.height > window.innerHeight - 8) top = y - r.height - 14;
    tip.style.left = Math.max(8, left) + "px"; tip.style.top = Math.max(8, top) + "px";
  }
  const hideTip = () => { tip.style.display = "none"; };
  const sw = (slot) => `<i class="sw" style="background:var(--s${slot})"></i>`;

  /* ── Courbes (base 100 rebasée sur la période choisie) ─────────────────── */
  function line(root, cfg) {
    const ranges = cfg.ranges ? [["1M", 31], ["3M", 92], ["6M", 183], ["1A", 0]] : null;
    let range = ranges ? "1A" : null;
    const bar = ranges ? h("div", "viz-ranges") : null;
    const legend = h("div", "viz-legend");
    cfg.series.forEach((s) => { const it = h("span"); it.innerHTML = sw(s.slot) + s.nom; legend.appendChild(it); });
    const box = h("div", "viz-box");
    if (bar) {
      ranges.forEach(([lab]) => {
        const b = h("button", "", lab); b.type = "button";
        b.onclick = () => { range = lab; draw(); };
        bar.appendChild(b);
      });
      root.appendChild(bar);
    }
    if (cfg.series.length > 1) root.appendChild(legend);
    root.appendChild(box);

    function draw() {
      if (bar) [...bar.children].forEach((b) => b.setAttribute("aria-pressed", b.textContent === range));
      let i0 = 0;
      if (range && range !== "1A") {  // 1A = toute la série, même fenêtre que les indicateurs chiffrés
        const days = ranges.find((r) => r[0] === range)[1];
        const last = new Date(cfg.dates[cfg.dates.length - 1]);
        const lim = new Date(last - days * 864e5).toISOString().slice(0, 10);
        i0 = Math.max(0, cfg.dates.findIndex((d) => d >= lim));
      }
      const dates = cfg.dates.slice(i0);
      const series = cfg.series.map((s) => {
        let v = s.valeurs.slice(i0);
        if (cfg.rebase) { const b = v.find((x) => x != null); v = v.map((x) => (x == null ? null : (x / b) * 100)); }
        return { ...s, v };
      });
      const W = Math.max(280, box.clientWidth), H = cfg.hauteur || 260;
      const m = { l: 44, r: cfg.series.length > 1 ? 92 : 16, t: 12, b: 26 };
      const all = series.flatMap((s) => s.v).filter((x) => x != null);
      let lo = Math.min(...all), hi = Math.max(...all);
      const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
      const X = (i) => m.l + (i / Math.max(1, dates.length - 1)) * (W - m.l - m.r);
      const Y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);
      box.innerHTML = "";
      const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": cfg.titre || "graphique" }, box);
      // Grille recessive + axe Y
      for (let k = 0; k <= 4; k++) {
        const v = lo + ((hi - lo) * k) / 4, y = Y(v);
        el("line", { x1: m.l, x2: W - m.r, y1: y, y2: y, class: "viz-grid" }, svg);
        el("text", { x: m.l - 6, y: y + 4, "text-anchor": "end", class: "viz-ax" }, svg).textContent = fr(v, v > 1000 ? 0 : 1);
      }
      if (cfg.rebase) el("line", { x1: m.l, x2: W - m.r, y1: Y(100), y2: Y(100), class: "viz-ref" }, svg);
      // Axe X : 4 repères
      const nt = W < 520 ? 3 : 4;  // moins de repères sur mobile pour éviter les chevauchements
      for (let k = 0; k < nt; k++) {
        const i = Math.round((k / (nt - 1)) * (dates.length - 1));
        el("text", { x: X(i), y: H - 6, "text-anchor": k === 0 ? "start" : k === nt - 1 ? "end" : "middle", class: "viz-ax" }, svg)
          .textContent = dlabel(dates[i]).replace(/^\d+ /, "");
      }
      // Séries
      const ends = [];
      series.forEach((s) => {
        let d = "", pen = false;
        s.v.forEach((v, i) => { if (v == null) { pen = false; return; } d += (pen ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1); pen = true; });
        el("path", { d, class: "viz-line", style: `stroke:var(--s${s.slot})` }, svg);
        const li = s.v.length - 1 - [...s.v].reverse().findIndex((v) => v != null);
        el("circle", { cx: X(li), cy: Y(s.v[li]), r: 4, class: "viz-dot", style: `fill:var(--s${s.slot})` }, svg);
        ends.push({ y: Y(s.v[li]), s, v: s.v[li] });
      });
      // Étiquettes directes en bout de courbe (décalées si elles se chevauchent)
      if (cfg.series.length > 1) {
        ends.sort((a, b) => a.y - b.y);
        for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 30) ends[k].y = ends[k - 1].y + 30;
        ends.forEach((e) => {
          const t = el("text", { x: W - m.r + 8, y: e.y, class: "viz-lab" }, svg);
          el("tspan", { x: W - m.r + 8, dy: 0, class: "viz-lab-n" }, t).textContent = e.s.court || e.s.nom;
          el("tspan", { x: W - m.r + 8, dy: 14 }, t).textContent = cfg.rebase ? sgn(e.v - 100) + " %" : fr(e.v, 2);
        });
      }
      // Réticule + infobulle
      const cross = el("line", { y1: m.t, y2: H - m.b, class: "viz-cross", style: "display:none" }, svg);
      const dots = series.map((s) => el("circle", { r: 4, class: "viz-dot", style: `fill:var(--s${s.slot});display:none` }, svg));
      const hit = el("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: "transparent" }, svg);
      const move = (ev) => {
        const r = svg.getBoundingClientRect();
        const px = ((ev.clientX - r.left) / r.width) * W;
        const i = Math.max(0, Math.min(dates.length - 1, Math.round(((px - m.l) / (W - m.l - m.r)) * (dates.length - 1))));
        cross.setAttribute("x1", X(i)); cross.setAttribute("x2", X(i)); cross.style.display = "";
        let html = `<b>${dlabel(dates[i])}</b>`;
        series.forEach((s, k) => {
          const v = s.v[i];
          if (v == null) { dots[k].style.display = "none"; return; }
          dots[k].setAttribute("cx", X(i)); dots[k].setAttribute("cy", Y(v)); dots[k].style.display = "";
          html += `<br>${sw(s.slot)}${s.nom} : <b>${cfg.rebase ? sgn(v - 100) + " %" : fr(v, 2) + (cfg.unite || "")}</b>`;
        });
        showTip(html, ev.clientX, ev.clientY);
      };
      hit.addEventListener("pointermove", move);
      hit.addEventListener("pointerleave", () => { hideTip(); cross.style.display = "none"; dots.forEach((d) => (d.style.display = "none")); });
    }
    draw();
    let t; new ResizeObserver(() => { clearTimeout(t); t = setTimeout(draw, 80); }).observe(box);
  }

  /* ── Barres classées (liste de jauges), avec limite optionnelle ───────── */
  function bars(root, cfg) {
    const max = Math.max(cfg.max || 0, ...cfg.items.map((i) => i.v));
    const list = h("div", "viz-meters");
    cfg.items.forEach((it) => {
      const row = h("div", "viz-m" + (it.alerte ? " over" : ""));
      row.appendChild(h("span", "viz-m-n", it.nom));
      const track = h("span", "viz-m-t");
      const fill = h("span", "viz-m-f"); fill.style.width = (it.v / max) * 100 + "%";
      track.appendChild(fill);
      if (it.limite) { const lim = h("span", "viz-m-l"); lim.style.left = (it.limite / max) * 100 + "%"; track.appendChild(lim); }
      row.appendChild(track);
      const u = cfg.unite ?? " %";
      row.appendChild(h("span", "viz-m-v", fr(it.v) + u + (it.alerte ? " ⚠" : "")));
      row.addEventListener("pointermove", (ev) => showTip(`<b>${it.nom}</b><br>${cfg.libelle || "Poids"} : <b>${fr(it.v)}${u}</b>${it.limite ? `<br>Limite : ${fr(it.limite, 0)} %${it.alerte ? " — <b>dépassée</b>" : ""}` : ""}${it.detail ? "<br>" + it.detail : ""}`, ev.clientX, ev.clientY));
      row.addEventListener("pointerleave", hideTip);
      list.appendChild(row);
    });
    root.appendChild(list);
  }

  /* ── Barre segmentée (part d'un tout, ≤ 6 parts) ──────────────────────── */
  function seg(root, cfg) {
    let items = cfg.items.slice();
    if (items.length > 6) {
      const reste = items.slice(5).reduce((a, b) => a + b.v, 0);
      items = items.slice(0, 5).concat([{ nom: "Autres", v: reste }]);
    }
    const barEl = h("div", "viz-seg");
    const legend = h("div", "viz-legend");
    items.forEach((it, k) => {
      const s = h("span", "viz-seg-p"); s.style.flex = it.v; s.style.background = `var(--s${k + 1})`;
      if (it.v >= 12) s.textContent = fr(it.v, 0) + " %";
      s.addEventListener("pointermove", (ev) => showTip(`${sw(k + 1)}<b>${it.nom}</b> : ${fr(it.v)} %`, ev.clientX, ev.clientY));
      s.addEventListener("pointerleave", hideTip);
      barEl.appendChild(s);
      const l = h("span"); l.innerHTML = sw(k + 1) + `${it.nom} <b>${fr(it.v, 0)} %</b>`; legend.appendChild(l);
    });
    root.appendChild(barEl); root.appendChild(legend);
  }

  /* ── Barres divergentes (contribution positive / négative) ─────────────── */
  function diverge(root, cfg) {
    const max = Math.max(...cfg.items.map((i) => Math.abs(i.v)), 0.0001);
    const list = h("div", "viz-div");
    cfg.items.forEach((it) => {
      const row = h("div", "viz-d");
      row.appendChild(h("span", "viz-m-n", it.nom));
      const track = h("span", "viz-d-t");
      const f = h("span", "viz-d-f " + (it.v >= 0 ? "pos" : "neg"));
      f.style.width = (Math.abs(it.v) / max) * 50 + "%";
      track.appendChild(f); row.appendChild(track);
      row.appendChild(h("span", "viz-m-v", sgn(it.v, 2) + " pt"));
      row.addEventListener("pointermove", (ev) => showTip(`<b>${it.nom}</b><br>${cfg.libelle} : <b>${sgn(it.v, 2)} point de %</b>`, ev.clientX, ev.clientY));
      row.addEventListener("pointerleave", hideTip);
      list.appendChild(row);
    });
    root.appendChild(list);
  }

  /* ── Barres groupées verticales (ex : CA et FCF par année) ─────────────── */
  function groupbars(root, cfg) {
    const legend = h("div", "viz-legend");
    cfg.series.forEach((s) => { const it = h("span"); it.innerHTML = sw(s.slot) + s.nom; legend.appendChild(it); });
    const box = h("div", "viz-box");
    root.appendChild(legend); root.appendChild(box);
    function draw() {
      const W = Math.max(280, box.clientWidth), H = 240, m = { l: 44, r: 8, t: 12, b: 26 };
      const vals = cfg.series.flatMap((s) => s.valeurs);
      const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals) * 1.08 || 1;
      const Y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);
      const n = cfg.categories.length, gw = (W - m.l - m.r) / n, bw = Math.min(28, (gw * 0.7) / cfg.series.length);
      box.innerHTML = "";
      const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": cfg.titre || "graphique" }, box);
      for (let k = 0; k <= 4; k++) {
        const v = lo + ((hi - lo) * k) / 4, y = Y(v);
        el("line", { x1: m.l, x2: W - m.r, y1: y, y2: y, class: "viz-grid" }, svg);
        el("text", { x: m.l - 6, y: y + 4, "text-anchor": "end", class: "viz-ax" }, svg).textContent = fr(v, 0);
      }
      el("line", { x1: m.l, x2: W - m.r, y1: Y(0), y2: Y(0), class: "viz-ref" }, svg);
      cfg.categories.forEach((c, i) => {
        const cx = m.l + gw * i + gw / 2, x0 = cx - (bw * cfg.series.length + 2 * (cfg.series.length - 1)) / 2;
        el("text", { x: cx, y: H - 6, "text-anchor": "middle", class: "viz-ax" }, svg).textContent = c;
        cfg.series.forEach((s, k) => {
          const v = s.valeurs[i], y1 = Y(Math.max(0, v)), y2 = Y(Math.min(0, v));
          const r = el("rect", { x: x0 + k * (bw + 2), y: y1, width: bw, height: Math.max(1, y2 - y1), rx: 3, style: `fill:var(--s${s.slot})`, class: "viz-bar" }, svg);
          r.addEventListener("pointermove", (ev) => showTip(`<b>${c}</b><br>${sw(s.slot)}${s.nom} : <b>${fr(v, 1)} ${cfg.unite || ""}</b>`, ev.clientX, ev.clientY));
          r.addEventListener("pointerleave", hideTip);
        });
      });
    }
    draw();
    let t; new ResizeObserver(() => { clearTimeout(t); t = setTimeout(draw, 80); }).observe(box);
  }

  /* ── Mini-courbe (tableau de bord marchés) ─────────────────────────────── */
  function spark(root, cfg) {
    const v = cfg.valeurs, W = 120, H = 28;
    if (!v || v.length < 2) return;
    const lo = Math.min(...v), hi = Math.max(...v), r = hi - lo || 1;
    const d = v.map((x, i) => (i ? "L" : "M") + ((i / (v.length - 1)) * W).toFixed(1) + " " + (2 + (1 - (x - lo) / r) * (H - 4)).toFixed(1)).join("");
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", class: "viz-spark", "aria-hidden": "true" }, root);
    el("path", { d, class: "viz-spark-l " + (v[v.length - 1] >= v[0] ? "pos" : "neg") }, svg);
  }

  /* ── Cascade (flux de trésorerie : du revenu à la variation de trésorerie) ─ */
  function waterfall(root, cfg) {
    const box = h("div", "viz-box"); root.appendChild(box);
    function draw() {
      const W = Math.max(280, box.clientWidth), H = 260, m = { l: 52, r: 8, t: 18, b: 44 };
      let cum = 0;
      const steps = cfg.items.map((it) => {
        if (it.total) { const s = { ...it, a: 0, b: cum }; return s; }
        const s = { ...it, a: cum, b: cum + it.v }; cum += it.v; return s;
      });
      const vals = steps.flatMap((s) => [s.a, s.b]);
      const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals) * 1.1 || 1;
      const Y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);
      const n = steps.length, gw = (W - m.l - m.r) / n, bw = Math.min(46, gw * 0.62);
      box.innerHTML = "";
      const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": cfg.titre || "cascade" }, box);
      for (let k = 0; k <= 4; k++) {
        const v = lo + ((hi - lo) * k) / 4, y = Y(v);
        el("line", { x1: m.l, x2: W - m.r, y1: y, y2: y, class: "viz-grid" }, svg);
        el("text", { x: m.l - 6, y: y + 4, "text-anchor": "end", class: "viz-ax" }, svg).textContent = fr(v, 0);
      }
      el("line", { x1: m.l, x2: W - m.r, y1: Y(0), y2: Y(0), class: "viz-ref" }, svg);
      steps.forEach((s, i) => {
        const x = m.l + gw * i + (gw - bw) / 2, y1 = Y(Math.max(s.a, s.b)), y2 = Y(Math.min(s.a, s.b));
        const cls = s.total ? "tot" : s.v >= 0 ? "pos" : "neg";
        const r = el("rect", { x, y: y1, width: bw, height: Math.max(1.5, y2 - y1), rx: 3, class: "viz-wf " + cls }, svg);
        if (i < n - 1 && !steps[i + 1].total) el("line", { x1: x + bw, x2: x + gw, y1: Y(s.b), y2: Y(s.b), class: "viz-wf-link" }, svg);
        el("text", { x: x + bw / 2, y: y1 - 5, "text-anchor": "middle", class: "viz-lab" }, svg).textContent = (s.total ? "" : s.v > 0 ? "+" : "") + fr(s.total ? s.b : s.v, 0);
        const lab = el("text", { x: x + bw / 2, y: H - m.b + 16, "text-anchor": "middle", class: "viz-ax" }, svg);
        s.nom.split("\n").forEach((part, k) => { el("tspan", { x: x + bw / 2, dy: k ? 12 : 0 }, lab).textContent = part; });
        r.addEventListener("pointermove", (ev) => showTip(`<b>${s.nom.replace("\n", " ")}</b><br>${s.total ? "Solde" : "Flux"} : <b>${sgn(s.total ? s.b : s.v, 0)} €</b>${s.def ? "<br>" + s.def : ""}`, ev.clientX, ev.clientY));
        r.addEventListener("pointerleave", hideTip);
      });
    }
    draw();
    let t; new ResizeObserver(() => { clearTimeout(t); t = setTimeout(draw, 80); }).observe(box);
  }

  const KINDS = { line, bars, seg, diverge, groupbars, spark, waterfall };
  function render(scope) {
    scope.querySelectorAll("[data-chart]:not([data-ok])").forEach((root) => {
      root.setAttribute("data-ok", "");
      const s = root.querySelector('script[type="application/json"]');
      if (!s) return;
      try { KINDS[root.dataset.chart](root, JSON.parse(s.textContent)); }
      catch (e) { root.insertAdjacentHTML("beforeend", '<p class="note">Graphique indisponible.</p>'); console.error(e); }
    });
  }
  window.VeilleCharts = { render, showTip, hideTip };
  render(document);
})();
