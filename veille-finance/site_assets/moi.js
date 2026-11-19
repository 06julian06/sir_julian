/* « Mon espace » : déchiffrement local (WebCrypto) puis tableau de bord personnel.
   La phrase secrète ne quitte jamais le navigateur. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const eur = (v, d = 0) => v == null ? "—" : Number(v).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d }) + " €";
  const sgnEur = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + eur(Math.abs(v));
  const num = (v, d = 1) => v == null ? "—" : Number(v).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const LS = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
               set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} } };

  // Glossaire : chaque terme financier a sa définition au survol.
  const DEF = {
    "Produits totaux": "Somme de tous les revenus du mois : travail (revenus d'activité) + capital (revenus passifs).",
    "Revenus d'activité": "Revenus tirés de ton travail : salaire, alternance, bourses, aides.",
    "Revenus passifs": "Revenus générés par ton capital sans travail : intérêts, dividendes, loyers.",
    "Charges fixes": "Dépenses incompressibles à court terme : loyer, abonnements, assurances.",
    "Charges variables": "Dépenses que tu pilotes chaque mois : alimentation, loisirs.",
    "Excédent brut (EBE)": "Produits − charges courantes, avant coût de la dette. Équivalent personnel de l'EBE d'une entreprise.",
    "Charges financières": "Intérêts payés sur tes dettes (estimés : capital restant × taux ÷ 12).",
    "Résultat net": "Ce qui reste après toutes les charges, intérêts compris. C'est ta capacité d'épargne.",
    "Flux de trésorerie opérationnels": "Cash généré par ton activité courante : revenus − charges.",
    "Flux de financement": "Cash lié à la dette : remboursements (sortie) et nouveaux emprunts (entrée).",
    "Free cash flow": "Cash disponible après service de la dette : ce que tu peux librement épargner ou investir.",
    "Flux d'investissement": "Cash placé : versements PEA, assurance-vie, achats d'actifs.",
    "Variation de trésorerie": "Ce qui reste sur ton compte courant en fin de mois, après investissements.",
    "Actif": "Tout ce que tu possèdes, valorisé aujourd'hui.",
    "Passif (dettes)": "Tout ce que tu dois : capital restant dû de tes emprunts.",
    "Capitaux propres (patrimoine net)": "Actif − dettes. Ta vraie richesse, l'équivalent des capitaux propres d'une entreprise.",
  };
  const CAT = { liquidites: "Liquidités", epargne_precaution: "Épargne de précaution", placements: "Placements financiers", immobilier: "Immobilier", autres: "Autres actifs" };
  const STATUT = { good: ["✔", "Sain"], warning: ["▲", "À surveiller"], critical: ["✖", "Critique"], na: ["–", "Non calculable"] };
  const term = (t) => `<span class="term" data-def="${esc(DEF[t] || "")}">${esc(t)}</span>`;

  async function dechiffrer(blob, phrase) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(phrase), "PBKDF2", false, ["deriveKey"]);
    const cle = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: b64(blob.sel), iterations: blob.iter, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(blob.iv) }, cle, b64(blob.ct));
    return JSON.parse(new TextDecoder().decode(pt));
  }

  const chart = (kind, data) => `<div class="viz" data-chart="${kind}"><script type="application/json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script></div>`;

  function ligne(lib, val, cls = "", def = true) {
    return `<tr class="${cls}"><td>${def && DEF[lib] ? term(lib) : esc(lib)}</td><td class="n">${val}</td></tr>`;
  }

  function vue(d) {
    const E = d.etats, J = d.jeu, cr = E.compte_resultat, fl = E.flux, bi = E.bilan, C = d.coach;
    const R = Object.fromEntries(E.ratios.map((r) => [r.code, r]));
    const faites = JSON.parse(LS.get("moi.missions") || "{}");
    const missions = [
      ...((C && C.missions) || []).map((m) => ({ id: m.titre, titre: m.titre, action: m.action, ind: m.indicateur, xp: m.xp })),
      ...J.missions_calculees.map((t) => ({ id: t, titre: t, action: "", ind: "", xp: 20 })),
    ];
    const xpMissions = missions.filter((m) => faites[m.id]).reduce((a, m) => a + m.xp, 0);

    return `
    <div class="moi-top card">
      <div class="lvl">
        <div class="lvl-badge" aria-label="Niveau ${J.niveau}">${J.niveau}</div>
        <div class="lvl-txt">
          <p class="kicker">Niveau ${J.niveau} · ${esc(J.titre_niveau)}${J.serie_mois ? ` · 🔥 ${J.serie_mois} mois de hausse d'affilée` : ""}</p>
          <div class="xp"><span style="width:${J.xp_pct}%"></span></div>
          <p class="note">${J.prochain_niveau ? `${J.xp_pct} % du chemin vers <b>${esc(J.prochain_niveau)}</b> (${J.seuil_prochain} % de ton nombre FIRE investi)` : "Niveau maximal : indépendance financière atteinte."} · ${xpMissions} XP de missions ce mois</p>
        </div>
      </div>
      <div class="score">
        <div class="score-n"><b>${J.score}</b><span>/100</span></div>
        <p class="note">Score de santé financière</p>
      </div>
    </div>

    <div class="kpis">
      <div class="kpi"><span class="tn">${term("Capitaux propres (patrimoine net)")}</span><span class="kv">${eur(bi.patrimoine_net)}</span><span class="ty">actif ${eur(bi.actif_total)} · dettes ${eur(bi.passif_total)}</span></div>
      <div class="kpi"><span class="tn">${term("Résultat net")} mensuel</span><span class="kv ${cr.resultat_net >= 0 ? "up" : "down"}">${sgnEur(cr.resultat_net)}</span><span class="ty">taux d'épargne ${num(R.taux_epargne.valeur)} %</span></div>
      <div class="kpi"><span class="tn">${term("Free cash flow")} mensuel</span><span class="kv ${fl.free_cash_flow >= 0 ? "up" : "down"}">${sgnEur(fl.free_cash_flow)}</span><span class="ty">après service de la dette</span></div>
      <div class="kpi"><span class="tn">Réserve de liquidité</span><span class="kv">${num(R.reserve_liquidite.valeur)} mois</span><span class="ty">objectif 6 mois</span></div>
    </div>

    <div class="viz-cols">
      <section class="card">
        <h2>Les 5 piliers du score</h2>
        ${chart("bars", { libelle: "Points", unite: " / 20", max: 20, items: J.piliers.map((p) => ({ nom: p.nom, v: p.pts, detail: p.detail })) })}
        <p class="note">Chaque pilier vaut 20 points. Survole pour voir le calcul.</p>
      </section>
      <section class="card">
        <h2>Missions</h2>
        <ul class="missions">${missions.map((m) => `
          <li><label><input type="checkbox" data-m="${esc(m.id)}" ${faites[m.id] ? "checked" : ""}>
          <span><b>${esc(m.titre)}</b> <span class="xp-tag">+${m.xp} XP</span>${m.action ? `<br>${esc(m.action)}` : ""}${m.ind ? `<br><small>Mesure : ${esc(m.ind)}</small>` : ""}</span></label></li>`).join("") || "<li class='muted'>Aucune mission : tout est en ordre.</li>"}</ul>
      </section>
    </div>

    <section class="card">
      <h2>Badges</h2>
      <div class="badges">${J.badges.map((b) => `
        <div class="bd ${b.obtenu ? "ok" : ""}"><span class="bd-i">${b.obtenu ? "🏅" : "🔒"}</span><b>${esc(b.nom)}</b><small>${esc(b.desc)}</small>
        ${b.obtenu ? "<small class='bd-s'>Débloqué</small>" : `<span class="xp sm"><span style="width:${b.progression}%"></span></span><small>${b.progression} %</small>`}</div>`).join("")}</div>
    </section>

    ${C ? `<section class="card mentor"><h2>L'analyse de ton coach</h2><p>${esc(C.diagnostic)}</p>
      <p><b>Point fort :</b> ${esc(C.point_fort)}</p><p><b>Maillon faible :</b> ${esc(C.point_faible)}</p>
      ${C.lien_actualite ? `<p><b>L'actualité et toi :</b> ${esc(C.lien_actualite)}</p>` : ""}</section>` : ""}

    <div class="tabs" role="tablist">
      ${[["cr", "Compte de résultat"], ["cf", "Flux de trésorerie"], ["bi", "Bilan"], ["ra", "Ratios"], ["pj", "Trajectoire"], ["pf", "Portefeuille"]]
        .map(([id, n], k) => `<button role="tab" data-tab="${id}" aria-selected="${k === 0}">${n}</button>`).join("")}
    </div>

    <section class="card tab" data-p="cr">
      <h2>Compte de résultat mensuel</h2>
      <table class="etat">
        ${ligne("Revenus d'activité", eur(cr.revenus_activite))}
        ${ligne("Revenus passifs", eur(cr.revenus_passifs))}
        ${ligne("Produits totaux", eur(cr.revenus_total), "st")}
        ${ligne("Charges fixes", "− " + eur(cr.charges_fixes))}
        ${ligne("Charges variables", "− " + eur(cr.charges_variables))}
        ${ligne("Excédent brut (EBE)", eur(cr.excedent_brut), "st")}
        ${ligne("Charges financières", "− " + eur(cr.charges_financieres, 2))}
        ${ligne("Résultat net", sgnEur(cr.resultat_net), "tot")}
      </table>
      <h3 class="vh">Où part chaque euro gagné</h3>
      ${chart("bars", { libelle: "Part des revenus", items: cr.detail_charges.slice().sort((a, b) => b.montant - a.montant).map((c) => ({ nom: c.poste, v: Math.round(c.montant / cr.revenus_total * 1000) / 10, detail: `${eur(c.montant)} / mois · charge ${c.nature || "fixe"}` })) })}
    </section>

    <section class="card tab" data-p="cf" hidden>
      <h2>Tableau des flux de trésorerie mensuels</h2>
      ${chart("waterfall", { titre: "Cascade de trésorerie", items: [
        { nom: "Revenus", v: cr.revenus_total, def: DEF["Produits totaux"] },
        { nom: "Charges", v: -cr.charges_total },
        { nom: "Flux\nopérationnels", total: true, def: DEF["Flux de trésorerie opérationnels"] },
        { nom: "Dette", v: fl.flux_financement, def: DEF["Flux de financement"] },
        { nom: "Free cash\nflow", total: true, def: DEF["Free cash flow"] },
        { nom: "Investis-\nsements", v: fl.flux_investissement, def: DEF["Flux d'investissement"] },
        { nom: "Variation\ntrésorerie", total: true, def: DEF["Variation de trésorerie"] },
      ] })}
      <table class="etat">
        ${ligne("Flux de trésorerie opérationnels", sgnEur(fl.flux_operationnels), "st")}
        ${ligne("Flux de financement", sgnEur(fl.flux_financement))}
        ${ligne("Free cash flow", sgnEur(fl.free_cash_flow), "st")}
        ${ligne("Flux d'investissement", sgnEur(fl.flux_investissement))}
        ${ligne("Variation de trésorerie", sgnEur(fl.variation_tresorerie), "tot")}
      </table>
      ${fl.variation_tresorerie < 0 ? `<p class="why rule">⚠ Ta trésorerie baisse chaque mois : tu investis ou rembourses plus que ce que tu génères. Tenable seulement si c'est voulu et temporaire.</p>` : ""}
    </section>

    <section class="card tab" data-p="bi" hidden>
      <h2>Bilan au ${new Date(d.genere_le).toLocaleDateString("fr-FR")}</h2>
      ${chart("seg", { items: Object.entries(bi.actifs_par_categorie).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ nom: CAT[k] || k, v: Math.round(v / bi.actif_total * 1000) / 10 })) })}
      <div class="bilan">
        <table class="etat"><tr class="th"><td>${term("Actif")}</td><td class="n">${eur(bi.actif_total)}</td></tr>
          ${bi.actifs.map((a) => ligne(a.poste, eur(a.montant), "", false)).join("")}</table>
        <table class="etat"><tr class="th"><td>${term("Passif (dettes)")}</td><td class="n">${eur(bi.passif_total)}</td></tr>
          ${bi.passifs.map((p) => ligne(`${p.poste} (${num(p.taux, 2)} %)`, eur(p.capital_restant), "", false)).join("")}
          ${ligne("Capitaux propres (patrimoine net)", eur(bi.patrimoine_net), "tot")}</table>
      </div>
      <p class="note">Équation du bilan : actif = dettes + capitaux propres (${eur(bi.actif_total)} = ${eur(bi.passif_total)} + ${eur(bi.patrimoine_net)}).</p>
    </section>

    <section class="card tab" data-p="ra" hidden>
      <h2>Ratios</h2>
      <div class="ratios">${E.ratios.map((r) => `
        <div class="ratio s-${r.statut}"><span class="tn">${esc(r.nom)}</span>
        <span class="kv">${num(r.valeur)} ${esc(r.unite)}</span>
        <span class="st">${STATUT[r.statut][0]} ${STATUT[r.statut][1]}</span>
        <small>Cible : ${r.plus_haut_mieux ? "≥" : "≤"} ${r.seuil_bon} ${esc(r.unite)} · alerte ${r.plus_haut_mieux ? "<" : ">"} ${r.seuil_alerte} ${esc(r.unite)}</small>
        <small class="muted">${esc(r.definition)}</small></div>`).join("")}</div>
      <p class="note">Nombre FIRE (indépendance financière) : ${eur(E.nombre_fire)} = charges annuelles × 25.</p>
    </section>

    <section class="card tab" data-p="pj" hidden>
      <h2>Trajectoire de ton patrimoine net</h2>
      ${chart("line", { dates: d.projection.annees.map((a) => a + "-01-01"), unite: " €", series: d.projection.series })}
      <p class="note">Projection : patrimoine actuel + résultat net mensuel investi chaque mois, à 3 rendements annuels nets d'inflation. Ce sont des hypothèses, pas des promesses.</p>
      ${(d.historique_auto || []).length > 1 ? `<h3 class="vh">Historique réel (relevé automatique chaque matin)</h3>
        ${chart("line", { dates: d.historique_auto.map((h) => h.date), unite: " €", series: [{ nom: "Patrimoine net", valeurs: d.historique_auto.map((h) => h.patrimoine_net), slot: 1 }] })}` : ""}
      ${(d.historique_manuel || []).length > 1 ? `<h3 class="vh">Tes relevés mensuels</h3>
        ${chart("line", { dates: d.historique_manuel.map((h) => h.mois + "-01"), unite: " €", series: [{ nom: "Patrimoine net", valeurs: d.historique_manuel.map((h) => h.patrimoine_net), slot: 1 }] })}` : ""}
    </section>

    <section class="card tab" data-p="pf" hidden>
      <h2>Portefeuille (montants réels)</h2>
      ${d.portefeuille ? `<div class="tscroll"><table class="pf"><tr><th>Ligne</th><th>Env.</th><th>Valeur</th><th>+/- value</th><th>Poids</th><th>Depuis PRU</th></tr>
        ${d.portefeuille.lignes.filter((l) => !l.indisponible).map((l) => `<tr><td>${esc(l.nom)}</td><td>${esc(l.enveloppe || "")}</td><td>${eur(l.valeur_eur)}</td>
        <td class="${l.pv_eur >= 0 ? "up" : "down"}">${sgnEur(l.pv_eur)}</td><td>${num(l.poids_pct)} %</td><td class="${l.perf_pct >= 0 ? "up" : "down"}">${num(l.perf_pct)} %</td></tr>`).join("")}
        </table></div><p class="note">Total ${eur(d.portefeuille.total_eur)} dont liquidités ${eur(d.portefeuille.liquidites_eur)} · <a href="portefeuille.html">graphiques détaillés</a></p>`
        : "<p class='muted'>Aucun portefeuille configuré.</p>"}
    </section>
    <p class="note">Calculé le ${new Date(d.genere_le).toLocaleString("fr-FR")} · <button type="button" class="lien" id="fermer">Verrouiller</button></p>`;
  }

  function brancher(root) {
    root.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => {
      root.querySelectorAll("[data-tab]").forEach((x) => x.setAttribute("aria-selected", x === b));
      root.querySelectorAll(".tab").forEach((p) => { p.hidden = p.dataset.p !== b.dataset.tab; });
      window.VeilleCharts.render(root);  // les graphiques d'un onglet caché se dessinent à l'ouverture
      LS.set("moi.onglet", b.dataset.tab);
    }));
    root.querySelectorAll("[data-m]").forEach((c) => c.addEventListener("change", () => {
      const f = JSON.parse(LS.get("moi.missions") || "{}");
      if (c.checked) f[c.dataset.m] = Date.now(); else delete f[c.dataset.m];
      LS.set("moi.missions", JSON.stringify(f));
    }));
    root.querySelectorAll(".term").forEach((t) => {
      t.addEventListener("pointermove", (ev) => t.dataset.def && window.VeilleCharts.showTip(`<b>${esc(t.textContent)}</b><br>${esc(t.dataset.def)}`, ev.clientX, ev.clientY));
      t.addEventListener("pointerleave", () => window.VeilleCharts.hideTip());
    });
    $("fermer").addEventListener("click", () => { LS.set("moi.phrase", null); location.reload(); });
    const onglet = LS.get("moi.onglet");
    const b = onglet && root.querySelector(`[data-tab="${onglet}"]`);
    if (b) b.click();
  }

  async function ouvrir(phrase, retenir) {
    const msg = $("msg");
    msg.textContent = "Déchiffrement…";
    try {
      const blob = await fetch("data/moi.enc.json?t=" + Date.now()).then((r) => r.json());
      const d = await dechiffrer(blob, phrase);
      if (retenir) LS.set("moi.phrase", phrase);
      const root = $("espace");
      root.innerHTML = vue(d); root.hidden = false; $("verrou").hidden = true;
      window.VeilleCharts.render(root);
      brancher(root);
    } catch (e) {
      LS.set("moi.phrase", null);
      msg.textContent = "Phrase secrète incorrecte (ou données indisponibles).";
      console.error(e);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const form = $("ouvrir");
    if (!form) return;
    form.addEventListener("submit", (e) => { e.preventDefault(); ouvrir($("phrase").value, $("retenir").checked); });
    const memo = LS.get("moi.phrase");
    if (memo) ouvrir(memo, true);
  });
})();
