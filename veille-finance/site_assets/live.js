/* Page « En direct » : lit data/live.json et data/direct.json, se rafraîchit toutes les 2 minutes
   sans recharger la page (le serveur republie toutes les 15 minutes). */
(function () {
  "use strict";
  const RUBRIQUES = [
    ["tout", "Tout"], ["important", "★ Important"], ["geopolitique", "Monde"], ["elections", "Élections"],
    ["banques_centrales", "Banques centrales"], ["macro", "Macro"], ["marches", "Marchés"],
    ["entreprises", "Entreprises"], ["regulation", "Régulation"], ["crypto", "Crypto"], ["epargne", "Épargne"],
  ];
  const NOMS = Object.fromEntries(RUBRIQUES);
  const ZONES = { USD: "🇺🇸 États-Unis", EUR: "🇪🇺 Zone euro", GBP: "🇬🇧 Royaume-Uni", JPY: "🇯🇵 Japon", CNY: "🇨🇳 Chine",
    CAD: "🇨🇦 Canada", AUD: "🇦🇺 Australie", NZD: "🇳🇿 Nouv.-Zélande", CHF: "🇨🇭 Suisse", ALL: "🌍 Monde" };
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fr = (v, d = 2) => Number(v).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const paris = (iso, opts) => new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", ...opts });

  let fil = [], filtre = "tout", q = "", limite = 60, cal = [];
  const store = (k, v) => { try { v === undefined ? localStorage.getItem(k) : localStorage.setItem(k, v); } catch (e) {} };
  try { filtre = localStorage.getItem("veille.filtre") || "tout"; } catch (e) {}

  function relatif(iso) {
    const min = Math.round((Date.now() - new Date(iso)) / 60000);
    if (min < 1) return "à l'instant";
    if (min < 60) return `il y a ${min} min`;
    if (min < 1440) return `il y a ${Math.round(min / 60)} h`;
    return paris(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  function renderFiltres() {
    const box = $("filtres"); box.innerHTML = "";
    const comptes = {};
    fil.forEach((i) => { comptes[i.rubrique] = (comptes[i.rubrique] || 0) + 1; });
    comptes.tout = fil.length;
    comptes.important = fil.filter((i) => (i.importance || 0) >= 3).length;
    RUBRIQUES.forEach(([id, nom]) => {
      if (!comptes[id] && id !== "tout" && id !== "important") return;
      const b = document.createElement("button");
      b.type = "button"; b.textContent = `${nom} ${comptes[id] || 0}`;
      b.setAttribute("aria-pressed", id === filtre);
      b.onclick = () => { filtre = id; limite = 60; store("veille.filtre", id); renderFiltres(); renderFil(); };
      box.appendChild(b);
    });
  }

  function renderFil() {
    const qq = q.toLowerCase();
    const liste = fil.filter((i) =>
      (filtre === "tout" || (filtre === "important" ? (i.importance || 0) >= 3 : i.rubrique === filtre)) &&
      (!qq || (i.titre + " " + (i.resume || "") + " " + i.source).toLowerCase().includes(qq)));
    $("fil").innerHTML = liste.slice(0, limite).map((i) => `
      <article class="li imp${i.importance || 0}">
        <div class="li-m"><span class="li-r r-${esc(i.rubrique)}">${esc(NOMS[i.rubrique] || i.rubrique)}</span>
          <span>${esc(i.source)} · ${relatif(i.date)}</span>${i.importance >= 4 ? '<span class="li-imp">● majeur</span>' : ""}</div>
        <a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.titre)}</a>
        ${i.pourquoi ? `<p class="li-why"><b>Pour toi :</b> ${esc(i.pourquoi)}</p>` : ""}
        ${i.decryptage ? `<p class="li-why"><a class="li-dec" href="decryptages/${esc(i.decryptage)}.html">→ Lire le décryptage : ce que ça veut dire</a></p>` : ""}
      </article>`).join("") || '<p class="muted">Rien pour ce filtre.</p>';
    $("plus").hidden = liste.length <= limite;
  }

  function renderDirect(d) {
    $("maj").textContent = "Mis à jour " + relatif(d.maj) + " · prochaine collecte automatique toutes les 15 min";
    $("ticker").innerHTML = (d.cours || []).map((c) => `
      <span class="tk"><b>${esc(c.nom)}</b> ${c.est_taux ? fr(c.cours) + " %" : fr(c.cours, c.cours < 10 ? 4 : 2)}
      <span class="${c.var_seance_pct > 0 ? "up" : c.var_seance_pct < 0 ? "down" : ""}">${c.var_seance_pct > 0 ? "▲ +" : c.var_seance_pct < 0 ? "▼ " : "■ "}${fr(c.var_seance_pct)} %</span>
      <small>${esc(c.heure || "")}</small></span>`).join("");
    cal = d.calendrier || [];
    renderCal();
  }

  function renderCal() {
    const fort = $("cal-fort").checked;
    const now = Date.now() - 6 * 3600e3;  // on garde les publications des 6 dernières heures pour voir le « réel »
    const rows = cal.filter((e) => e.date && new Date(e.date) >= now && (!fort || e.impact >= 2));
    $("cal").querySelector("tbody").innerHTML = rows.slice(0, 40).map((e) => `
      <tr class="imp-${e.impact}"><td>${paris(e.date, { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
      <td>${esc(ZONES[e.pays] || e.pays)}</td><td>${"●".repeat(e.impact)}<span class="vis"> impact ${e.impact}/3</span> ${esc(e.evenement)}</td>
      <td><b>${esc(e.attendu || "—")}</b></td><td>${esc(e.precedent || "—")}</td><td>${esc(e.reel || "—")}</td></tr>`).join("")
      || '<tr><td colspan="6" class="muted">Calendrier indisponible pour l\'instant.</td></tr>';
  }

  async function charger() {
    try {
      const [l, d] = await Promise.all([
        fetch("data/live.json?t=" + Date.now()).then((r) => r.json()),
        fetch("data/direct.json?t=" + Date.now()).then((r) => r.json()),
      ]);
      fil = l; renderFiltres(); renderFil(); renderDirect(d);
    } catch (e) {
      $("maj").textContent = "Données en direct indisponibles pour le moment.";
    }
  }

  $("recherche").addEventListener("input", (e) => { q = e.target.value; renderFil(); });
  $("plus").addEventListener("click", () => { limite += 60; renderFil(); });
  $("cal-fort").addEventListener("change", renderCal);
  charger();
  setInterval(charger, 120000);
})();
