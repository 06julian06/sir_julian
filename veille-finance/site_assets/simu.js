/* Simulateurs : calculs locaux, aucune donnée envoyée. */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const nf = (d) => new Intl.NumberFormat("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const eur = (v) => (isFinite(v) ? nf(0).format(v) + " €" : "—");
  const pc = (v, d = 1) => (isFinite(v) ? nf(d).format(v) + " %" : "—");
  const x = (v, d = 1) => (isFinite(v) ? nf(d).format(v) + "×" : "—");
  const val = (f) => Object.fromEntries([...new FormData(f)].map(([k, v]) => [k, parseFloat(String(v).replace(",", "."))]));
  const ligne = (lib, v, expl) => `<tr><td>${lib}${expl ? `<br><span class="muted small">${expl}</span>` : ""}</td><td class="n"><b>${v}</b></td></tr>`;
  const tab = (rows) => `<div class="tscroll"><table class="sim-t"><tbody>${rows.join("")}</tbody></table></div>`;
  const chart = (data) => `<div class="viz" data-chart="line"><script type="application/json">${JSON.stringify(data).replace(/</g, "\\u003c")}<\/script></div>`;
  const tauxMensuel = (annuel) => Math.pow(1 + annuel / 100, 1 / 12) - 1;

  const SIMS = {
    dca(v) {
      const r = tauxMensuel(v.rendement - v.frais), inf = v.inflation / 100, an0 = new Date().getFullYear();
      let V = v.capital, verse = v.capital; const dates = [`${an0}-01-01`], pv = [V], pt = [verse];
      for (let a = 1; a <= v.annees; a++) {
        for (let m = 0; m < 12; m++) { V = V * (1 + r) + v.mensuel; verse += v.mensuel; }
        dates.push(`${an0 + a}-01-01`); pv.push(Math.round(V)); pt.push(Math.round(verse));
      }
      const reel = V / Math.pow(1 + inf, v.annees), gains = V - verse;
      // Coût des frais : même calcul sans frais
      let Vsf = v.capital; const rs = tauxMensuel(v.rendement);
      for (let i = 0; i < v.annees * 12; i++) Vsf = Vsf * (1 + rs) + v.mensuel;
      return `<div class="kpis">
          <div class="kpi"><span class="kv">${eur(V)}</span><span class="tn">dans ${v.annees} ans</span></div>
          <div class="kpi"><span class="kv">${eur(verse)}</span><span class="tn">versés au total</span></div>
          <div class="kpi"><span class="kv up">${eur(gains)}</span><span class="tn">gains (intérêts composés)</span></div>
          <div class="kpi"><span class="kv">${eur(reel)}</span><span class="tn">en euros d'aujourd'hui (après inflation)</span></div></div>
        ${chart({ dates, unite: " €", series: [{ nom: "Valeur du portefeuille", court: "Valeur", valeurs: pv, slot: 1 }, { nom: "Total versé", court: "Versé", valeurs: pt, slot: 2 }] })}
        <p>Les gains représentent <b>${pc((gains / V) * 100, 0)}</b> de la valeur finale : c'est l'effet des intérêts composés (les gains produisent eux-mêmes des gains). Les frais de ${pc(v.frais, 2)}/an te coûtent <b>${eur(Vsf - V)}</b> sur la période.</p>`;
    },
    krach(v) {
      const apres = v.valeur * (1 - v.baisse / 100), perte = v.valeur - apres;
      const hausseNecessaire = (v.valeur / apres - 1) * 100, r = tauxMensuel(v.reprise);
      const mois = (avecDCA) => { let V = apres, cible = v.valeur, n = 0; while (V < cible && n < 1200) { V = V * (1 + r) + (avecDCA ? v.mensuel : 0); cible += avecDCA ? v.mensuel : 0; n++; } return n; };
      // Avec DCA, on mesure le retour à « valeur d'avant + versements » : la vraie question est « ai-je perdu de l'argent ? »
      const sans = mois(false), avec = mois(true);
      const duree = (n) => (n >= 1200 ? "plus de 100 ans" : n < 12 ? `${n} mois` : `${nf(1).format(n / 12)} ans`);
      return tab([
        ligne("Valeur après la baisse", eur(apres)),
        ligne("Perte latente", `<span class="down">−${eur(perte)}</span>`, "Latente = sur le papier. Elle ne devient réelle que si tu vends."),
        ligne("Hausse nécessaire pour revenir au point de départ", pc(hausseNecessaire, 0), `Asymétrie : après −${pc(v.baisse, 0)}, il faut +${pc(hausseNecessaire, 0)} pour revenir à zéro.`),
        ligne("Retour au niveau d'avant, sans versement", duree(sans)),
        ligne("Retour au niveau d'avant + versements, en continuant ton DCA", duree(avec), "Tes versements achètent des parts moins chères pendant la baisse : c'est ce qui raccourcit la reprise."),
      ]) + `<p class="why"><strong>La leçon :</strong> la perte devient définitive surtout quand on vend au plus bas. Le MSCI World a perdu environ 55 % en 2008-2009 ; ceux qui ont continué à investir ont récupéré bien plus vite que l'indice.</p>`;
    },
    objectif(v) {
      const r = tauxMensuel(v.rendement), n = v.annees * 12, fvCap = v.capital * Math.pow(1 + r, n);
      const fact = r === 0 ? n : (Math.pow(1 + r, n) - 1) / r;
      const besoin = Math.max(0, (v.cible - fvCap) / fact);
      const scen = [v.rendement - 2, v.rendement + 2].map((t) => { const rr = tauxMensuel(t), f = rr === 0 ? n : (Math.pow(1 + rr, n) - 1) / rr; return { t, b: Math.max(0, (v.cible - v.capital * Math.pow(1 + rr, n)) / f) }; });
      return tab([
        ligne("Versement mensuel nécessaire", eur(besoin), `à ${pc(v.rendement, 1)} par an pendant ${v.annees} ans`),
        ligne("Si le rendement est de " + pc(scen[0].t, 1), eur(scen[0].b)),
        ligne("Si le rendement est de " + pc(scen[1].t, 1), eur(scen[1].b)),
        ligne("Ton capital actuel deviendra seul", eur(fvCap)),
      ]) + `<p class="note">2 points de rendement en plus ou en moins changent énormément l'effort nécessaire : c'est pourquoi les frais et la régularité comptent autant.</p>`;
    },
    valo(v) {
      const cap = v.cours * v.actions, ev = cap + v.dette, bpa = v.rn / v.actions, per = cap / v.rn;
      const evE = ev / v.ebitda, fcfy = (v.fcf / cap) * 100, levier = v.dette / v.ebitda, roe = (v.rn / v.cp) * 100, peg = per / v.croissance;
      const rep = (val, bas, haut, txtB, txtM, txtH) => (!isFinite(val) ? "" : val < bas ? txtB : val > haut ? txtH : txtM);
      return tab([
        ligne("Capitalisation boursière", nf(0).format(cap) + " M", "Cours × nombre d'actions : ce que la bourse paie pour 100 % des actions."),
        ligne("Valeur d'entreprise (EV)", nf(0).format(ev) + " M", "Capitalisation + dette nette : le prix pour racheter toute l'entreprise, dettes comprises."),
        ligne("Bénéfice par action (BPA)", nf(2).format(bpa), "Résultat net ÷ nombre d'actions."),
        ligne("PER", x(per), `Cours ÷ BPA : tu paies ${nf(0).format(per)} années de bénéfices actuels. ${rep(per, 12, 25, "Plutôt bas : le marché doute de l'avenir, ou c'est une opportunité.", "Dans la moyenne historique des grandes entreprises (≈ 15-20).", "Élevé : le marché attend une forte croissance.")}`),
        ligne("PEG", x(peg, 2), "PER ÷ croissance attendue du bénéfice. Autour de 1 : prix cohérent avec la croissance ; nettement au-dessus : la croissance est déjà très payée."),
        ligne("EV/EBITDA", x(evE), `Valeur d'entreprise ÷ EBITDA : compare des sociétés endettées ou non. ${rep(evE, 7, 15, "Bas.", "Moyen pour une grande entreprise (≈ 8-12).", "Élevé : typique de la tech ou du luxe.")}`),
        ligne("Rendement du free cash flow", pc(fcfy), `FCF ÷ capitalisation : le rendement « en cash » si tu achetais toute l'entreprise. ${rep(fcfy, 3, 7, "Faible : tu paies cher le cash produit.", "Correct.", "Élevé : beaucoup de cash pour le prix, ou un risque perçu.")}`),
        ligne("Dette nette / EBITDA", x(levier), `Années d'EBITDA pour rembourser la dette. ${rep(levier, 2, 3.5, v.dette < 0 ? "Trésorerie nette : aucune dette nette." : "Endettement confortable.", "Endettement modéré.", "Endettement élevé : sensible aux taux.")}`),
        ligne("ROE", pc(roe), "Résultat net ÷ capitaux propres : rentabilité de l'argent des actionnaires. Vérifie qu'il ne vient pas surtout de la dette."),
      ]);
    },
  };

  function calculer(id) {
    const sec = $("#sim-" + id), v = val($("form", sec));
    if (Object.values(v).some((n) => !isFinite(n))) { $("#r-" + id).innerHTML = `<p class="muted">Complète tous les champs.</p>`; return; }
    $("#r-" + id).innerHTML = SIMS[id](v);
    if (window.VeilleCharts) window.VeilleCharts.render($("#r-" + id));
  }
  document.querySelectorAll(".sim").forEach((sec) => {
    const id = sec.id.slice(4);
    $("form", sec).addEventListener("input", () => calculer(id));
    $("form", sec).addEventListener("submit", (e) => e.preventDefault());
    calculer(id);
  });
  document.querySelectorAll("[data-sim]").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("[data-sim]").forEach((x) => x.setAttribute("aria-pressed", x === b));
    document.querySelectorAll(".sim").forEach((s) => { s.hidden = s.id !== "sim-" + b.dataset.sim; });
    calculer(b.dataset.sim);
  }));
})();
