/* Cap 2046 — application monopage, JavaScript pur, aucune dépendance.
   Données : data/events.json (événements), data/etf.json (composition des lignes).
   Portefeuille, plan et journal : localStorage, avec export/import JSON. */
"use strict";

/* ═══ 1. Utilitaires ═════════════════════════════════════════════════════════ */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nf = (d) => new Intl.NumberFormat("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
const eur = (v, d = 0) => (v == null || !isFinite(v) ? "—" : nf(d).format(v) + " €");
const pct = (v, d = 1) => (v == null || !isFinite(v) ? "—" : nf(d).format(v) + " %");
const pts = (v, d = 1) => (v == null || !isFinite(v) ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "") + nf(d).format(Math.abs(v)) + " pt" + (Math.abs(v) >= 2 ? "s" : ""));
const TZ = "Europe/Paris";
const isoParis = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const heureParis = (d) => new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);
const ajoutJours = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const ecartJours = (a, b) => Math.round((new Date(b + "T12:00:00Z") - new Date(a + "T12:00:00Z")) / 864e5);
const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const JOURS_C = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const dateLongue = (iso) => { const d = new Date(iso + "T12:00:00Z"); return `${JOURS[d.getUTCDay()]} ${d.getUTCDate()} ${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const MOIS_C = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const dateCourte = (iso) => { const d = new Date(iso + "T12:00:00Z"); return `${JOURS_C[d.getUTCDay()]} ${d.getUTCDate()} ${MOIS_C[d.getUTCMonth()]}`; };
const moisLong = (ym) => { const [y, m] = ym.split("-").map(Number); return `${MOIS[m - 1]} ${y}`; };
const AUJ = () => isoParis(new Date());

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

function confirmer(message, oui = "Confirmer") {
  return new Promise((resoudre) => {
    const fond = document.createElement("div");
    fond.className = "guide-fond";
    fond.innerHTML = `<div class="guide" role="alertdialog" aria-modal="true"><p>${esc(message)}</p>
      <div class="btns"><button type="button" class="btn" data-c="non">Annuler</button><button type="button" class="btn p" data-c="oui">${esc(oui)}</button></div></div>`;
    document.body.appendChild(fond);
    const fin = (r) => { if (fond.parentNode) fond.parentNode.removeChild(fond); resoudre(r); };
    fond.addEventListener("click", (e) => { const b = e.target.closest("[data-c]"); if (b) fin(b.dataset.c === "oui"); else if (e.target === fond) fin(false); });
    $("[data-c=oui]", fond).focus();
  });
}

/* ═══ 2. Glossaire : chaque terme expliqué en une phrase ═════════════════════ */
const GLOSSAIRE = {
  "DCA": "Investir le même montant à intervalle régulier, quel que soit le niveau du marché, pour lisser le prix d'achat et éviter de jouer le « bon moment ».",
  "PEA": "Plan d'épargne en actions : enveloppe fiscale française, exonérée d'impôt sur les gains (hors prélèvements sociaux) après 5 ans, limitée aux actions européennes et aux ETF éligibles.",
  "ETF": "Fonds coté en bourse qui réplique un indice (par exemple les 1 500 plus grandes entreprises mondiales) : une seule ligne, des centaines d'entreprises.",
  "ETF synthétique": "ETF qui ne détient pas directement les actions de l'indice mais un panier éligible PEA plus un contrat (swap) qui lui verse la performance de l'indice.",
  "FOMC": "Comité de la Réserve fédérale américaine qui fixe les taux directeurs des États-Unis, huit fois par an.",
  "taux directeur": "Taux auquel une banque centrale prête aux banques ; il fixe le coût de l'argent dans toute l'économie et influence la valeur des actions.",
  "CPI": "Indice des prix à la consommation américain : la mesure de l'inflation la plus suivie par les marchés.",
  "PCE": "Indice des prix des dépenses de consommation américaines : la mesure d'inflation préférée de la Fed.",
  "PIB": "Produit intérieur brut : la valeur de tout ce qu'un pays produit ; sa variation mesure la croissance.",
  "IPCH": "Indice des prix harmonisé de la zone euro, publié par Eurostat : la mesure d'inflation que vise la BCE (2 %).",
  "poids": "Part d'une ligne dans la valeur totale de ton portefeuille.",
  "cible": "Le poids que ton plan prévoit pour une ligne.",
  "écart": "Différence, en points de pourcentage, entre le poids réel d'une ligne et sa cible.",
  "sous-pondérée": "Ligne dont le poids réel est inférieur à sa cible : c'est elle qui reçoit le prochain versement.",
  "plafond": "Poids maximum autorisé par tes règles pour une action individuelle (10 %).",
  "transparisation": "Regarder à l'intérieur des ETF pour savoir à quelles entreprises et quels pays tu es réellement exposé.",
  "exposition": "Part de ton portefeuille qui dépend réellement d'un pays, d'une entreprise ou d'un événement.",
  "quatre sorcières": "Le 3e vendredi de mars, juin, septembre et décembre, de nombreux contrats dérivés expirent en même temps : volumes élevés, sans effet de fond.",
  "factsheet": "Fiche mensuelle officielle d'un ETF publiée par son émetteur : composition, frais, performance, date des données.",
  "FOMO": "« Fear of missing out » : la peur de rater une occasion, qui pousse à acheter dans l'urgence ce qui vient de monter.",
  "effet de levier": "Produit qui multiplie les gains et les pertes (turbo, CFD, ETF ×2) ; une baisse de 50 % peut effacer toute la mise.",
  "market timing": "Essayer d'acheter au plus bas et de vendre au plus haut en anticipant les marchés ; statistiquement perdant pour un particulier.",
  "fourchette": "Écart entre le meilleur prix d'achat et le meilleur prix de vente affichés. Tu le paies à chaque ordre : plus il est étroit, mieux c'est.",
  "ordre à cours limité": "Ordre où tu fixes le prix maximum que tu acceptes de payer : tu ne paieras jamais plus, même si le marché bouge brutalement.",
  "fixing": "Enchère où tous les ordres accumulés s'exécutent à un prix unique (à l'ouverture et à la clôture). Prix parfois éloigné de la valeur réelle à l'ouverture.",
  "teneur de marché": "Intermédiaire qui affiche en permanence un prix d'achat et un prix de vente sur un ETF. Il resserre sa fourchette quand les actions sous-jacentes sont cotées.",
  "rééquilibrer": "Ramener les poids vers les cibles. Dans ton plan, cela se fait en orientant les versements, pas en vendant.",
};
const g = (terme, libelle) => `<button type="button" class="g" data-g="${esc(terme)}">${esc(libelle || terme)}</button>`;
let popActif = null;
document.addEventListener("click", (e) => {
  const b = e.target.closest(".g");
  if (popActif) { popActif.remove(); popActif = null; }
  if (!b) return;
  const pop = document.createElement("div");
  pop.className = "pop"; pop.setAttribute("role", "tooltip");
  pop.innerHTML = `<strong>${esc(b.dataset.g)}</strong> : ${esc(GLOSSAIRE[b.dataset.g] || "")}`;
  document.body.appendChild(pop);
  const r = b.getBoundingClientRect(), pr = pop.getBoundingClientRect();
  pop.style.left = Math.max(8, Math.min(window.innerWidth - pr.width - 8, r.left)) + "px";
  pop.style.top = (r.bottom + pr.height + 12 > window.innerHeight ? r.top - pr.height - 8 : r.bottom + 6) + "px";
  popActif = pop;
  setTimeout(() => { if (popActif === pop) { pop.remove(); popActif = null; } }, 8000);  // se ferme seule
  e.stopPropagation();
});

/* ═══ 3. État local (localStorage) ═══════════════════════════════════════════ */
const CLE = "cap2046.v1";
const DEFAUT = () => ({
  version: 1,
  positions: [
    { id: "WPEA", nom: "WPEA — ETF Monde", parts: 225, cours: null, cours_le: null, cible: 38, achat: true, type: "etf", note: "" },
    { id: "ETZ", nom: "ETZ — ETF Europe", parts: 16, cours: null, cours_le: null, cible: 28, achat: true, type: "etf", note: "" },
    { id: "EM", nom: "Amundi PEA Émergents", parts: 26, cours: null, cours_le: null, cible: 18, achat: true, type: "etf", note: "" },
    { id: "SGO", nom: "Saint-Gobain", parts: 10, cours: null, cours_le: null, cible: 12, achat: false, type: "action", note: "Pas de renforcement" },
    { id: "NDX", nom: "Amundi PEA Nasdaq-100", parts: 131, cours: null, cours_le: null, cible: 4, achat: false, type: "etf", note: "Plus aucun achat : dilution" },
  ],
  especes: 0,
  plafond_ligne: 10,
  plan: {
    objectif: 1000000, annee: 2046,
    v1: 726, v1_jusqu_a: "2027-06", v2: 500,
    depart: "2027-09", v_pendant: 0, reprise: "2028-09", v_reprise: 500,
    rendement: 6,
  },
  journal: [],
});
let S;
let stockageOK = true;
function charger() {
  let brut = null;
  try { brut = localStorage.getItem(CLE); } catch (e) { stockageOK = false; }
  const d = DEFAUT();
  if (!brut) return d;
  try {
    const x = JSON.parse(brut);
    return valider(x) ? { ...d, ...x, plan: { ...d.plan, ...(x.plan || {}) } } : d;
  } catch (e) { return d; }
}
function valider(x) {
  return x && typeof x === "object" && Array.isArray(x.positions) && x.positions.every((p) => p && typeof p.id === "string" && isFinite(+p.parts))
    && (x.journal === undefined || Array.isArray(x.journal));
}
function sauver() {
  try { localStorage.setItem(CLE, JSON.stringify(S)); stockageOK = true; } catch (e) { stockageOK = false; }
}

/* ═══ 4. Données publiées ════════════════════════════════════════════════════ */
let SOURCE_EV = "copie";
// La veille IA est relayée sous /veille/ sur le site Netlify uniquement (pas en local, pas dans un aperçu).
const VEILLE_DISPO = location.protocol.startsWith("http") && !/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname) && !/claude|anthropic/.test(location.hostname);
let BOURSES = { bourses: [], lignes_fenetres: {} };
let EVENTS = [], A_CONFIRMER = [], STATUT = {}, GENERE = null, ETF = { lignes: {}, noms_zones: {} };

/* ═══ 5. Portefeuille ════════════════════════════════════════════════════════ */
function valorisation() {
  const lignes = S.positions.map((p) => ({ ...p, valeur: p.cours > 0 ? p.parts * p.cours : null }));
  const complet = lignes.every((l) => l.valeur != null);
  const total = complet ? lignes.reduce((a, l) => a + l.valeur, 0) + (+S.especes || 0) : null;
  const sommeCibles = lignes.reduce((a, l) => a + (+l.cible || 0), 0);
  for (const l of lignes) {
    l.poids = complet && total > 0 ? (l.valeur / total) * 100 : null;
    l.ecart = l.poids != null ? l.poids - l.cible : null;
    l.poidsCalc = l.poids != null ? l.poids : sommeCibles > 0 ? (l.cible / sommeCibles) * 100 : 0; // repli : allocation cible
  }
  return { lignes, total, complet, sommeCibles };
}

function versementPour(ym, plan = S.plan) {
  if (ym >= plan.reprise) return +plan.v_reprise || 0;
  if (ym >= plan.depart) return +plan.v_pendant || 0;
  return ym <= plan.v1_jusqu_a ? +plan.v1 || 0 : +plan.v2 || 0;
}

function suggestionDCA(V) {
  const { lignes, total, complet } = valorisation();
  if (!complet || !(V > 0)) return null;
  const apres = total + V;
  const candidates = lignes.filter((l) => l.achat).map((l) => ({ l, manque: (l.cible / 100) * apres - l.valeur }));
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.manque - a.manque);
  const c = candidates[0];
  return { ligne: c.l, manque: c.manque, parts: Math.floor(V / c.l.cours), reste: V - Math.floor(V / c.l.cours) * c.l.cours };
}

function alertesPortefeuille(v = valorisation()) {
  const out = [];
  if (!v.complet) out.push({ niveau: "", html: `Saisis le cours de chaque ligne dans l'onglet Portefeuille : en attendant, les calculs d'impact utilisent ton allocation <em>cible</em>, pas tes poids réels.` });
  if (Math.abs(v.sommeCibles - 100) > 0.05) out.push({ niveau: "fort", html: `Tes cibles totalisent ${pct(v.sommeCibles)} au lieu de 100 %.` });
  for (const l of v.lignes) {
    if (l.type === "action" && l.cible > S.plafond_ligne) out.push({ niveau: "", html: `Incohérence de ton plan : la cible de <b>${esc(l.nom)}</b> (${pct(l.cible, 0)}) dépasse ton ${g("plafond")} de ${pct(S.plafond_ligne, 0)} par action. Tranche : baisse la cible ou ajoute une autre action.` });
    if (l.type === "action" && l.poids != null && l.poids > S.plafond_ligne) out.push({ niveau: "fort", html: `<b>${esc(l.nom)}</b> pèse ${pct(l.poids)}, au-dessus de ton plafond de ${pct(S.plafond_ligne, 0)}.` });
    if (l.ecart != null && Math.abs(l.ecart) > 5) out.push({ niveau: "", html: `<b>${esc(l.nom)}</b> : ${pct(l.poids)} pour une cible de ${pct(l.cible, 0)} (${g("écart")} ${pts(l.ecart)}).` });
    if (l.cours_le && ecartJours(l.cours_le, AUJ()) > 14) out.push({ niveau: "", html: `Le cours de <b>${esc(l.nom)}</b> date du ${dateCourte(l.cours_le)} : mets-le à jour pour des poids justes.` });
  }
  return out;
}

/* ═══ 6. Exposition, impact, verdict ═════════════════════════════════════════ */
function expositionLigne(ev, id) {
  const c = ETF.lignes[id];
  if (!c) return { part: 0, verifie: false };
  let part = 0;
  if (ev.categorie === "resultats" && ev.societes && ev.societes.length) part = ev.societes.reduce((a, s) => a + (c.societes[s] || 0), 0) / 100;
  else if (ev.zones && ev.zones.length) part = ev.zones.reduce((a, z) => a + (c.zones[z] || 0), 0) / 100;
  return { part: Math.min(1, part), verifie: !!c.verifie };
}

function analyse(ev, v = valorisation()) {
  const detail = v.lignes.map((l) => {
    const x = expositionLigne(ev, l.id);
    return { id: l.id, nom: l.nom, poids: l.poidsCalc, part: x.part, contribution: (l.poidsCalc * x.part), verifie: x.verifie };
  }).filter((d) => d.part > 0);
  const expo = detail.reduce((a, d) => a + d.contribution, 0) / 100; // 0..1 du portefeuille
  const imp = +ev.importance || 1;
  let niveau = "faible";
  if (ev.categorie === "resultats") niveau = expo >= 0.03 ? "fort" : expo >= 0.01 ? "moyen" : "faible";
  else if (ev.categorie === "marche") niveau = "faible";
  else if ((imp >= 3 && expo >= 0.4) || (imp === 2 && expo >= 0.7)) niveau = "fort";
  else if ((imp >= 3 && expo >= 0.1) || (imp === 2 && expo >= 0.2)) niveau = "moyen";
  const rang = { fort: 3, moyen: 2, faible: 1 }[niveau];
  return { detail, expo, niveau, rang, score: rang * 10 + imp + expo, modeCible: !v.complet, verdict: verdict(ev, niveau, expo, v) };
}

function verdict(ev, niveau, expo, v) {
  const ex = pct(expo * 100, 0);
  const sugg = suggestionDCA(versementPour(AUJ().slice(0, 7)));
  const prochain = sugg ? `ton prochain versement va sur ${sugg.ligne.nom}` : "ton prochain versement suit ton plan";
  if (ev.categorie === "marche") return { code: "rien", titre: "Ne rien faire, continue ton DCA",
    raison: `C'est un événement technique, sans effet sur la valeur de long terme de tes ETF. Évite seulement de passer un ordre ce jour-là si la bourse concernée est fermée.` };
  if (ev.categorie === "fiscalite") return { code: "surv", titre: "Surveiller",
    raison: `Ce texte peut toucher la fiscalité de ton PEA ou les taux français, mais rien ne change avant son adoption définitive. Lis la version finale ; d'ici là, ${prochain}.` };
  if (niveau !== "fort") return { code: "rien", titre: "Ne rien faire, continue ton DCA",
    raison: `Environ ${ex} de ton portefeuille est exposé à cet événement, et ton plan est un ${g("DCA")} sur 20 ans : un chiffre isolé ne change pas une allocation de long terme. Continue tes versements comme prévu.` };
  const derive = v.complet ? v.lignes.filter((l) => (l.ecart != null && Math.abs(l.ecart) > 5) || (l.type === "action" && l.poids > S.plafond_ligne)) : [];
  if (derive.length) {
    const l = derive.sort((a, b) => Math.abs(b.ecart) - Math.abs(a.ecart))[0];
    return { code: "revoir", titre: "Revoir l'allocation (par tes versements)",
      raison: `Environ ${ex} de ton portefeuille est exposé, et ${esc(l.nom)} est à ${pct(l.poids)} pour une cible de ${pct(l.cible, 0)} : ton allocation dérive déjà de plus de 5 points. Corrige par tes versements (${prochain}), jamais par une vente sur l'actualité.` };
  }
  return { code: "surv", titre: "Surveiller",
    raison: `Environ ${ex} de ton portefeuille est exposé : regarde le résultat pour comprendre le mouvement, sans agir. Ton allocation est dans les clous ; ${prochain}.` };
}

function dateEvt(ev) { return ev.datetime_utc ? isoParis(new Date(ev.datetime_utc)) : ev.date; }
function heureEvt(ev) {
  if (!ev.datetime_utc) return { txt: "heure non communiquée", note: "" };
  const h = heureParis(new Date(ev.datetime_utc));
  return { txt: h, note: ev.heure_verifiee ? "heure officielle" : "heure habituelle, non vérifiée" };
}
const CATS = { banque_centrale: "Banques centrales", macro: "Macro", resultats: "Résultats", geopolitique: "Géopolitique", marche: "Marché", fiscalite: "Fiscalité / réglementation" };
const IMP = { 3: "fort", 2: "moyen", 1: "faible" };
const badgeImpact = (n) => `<span class="badge b-${n}">${{ fort: "▲ Impact fort", moyen: "■ Impact moyen", faible: "○ Impact faible" }[n]}</span>`;
function badgeVerif(ev) {
  if (!ev.verifie) return `<span class="badge b-nv">⚠ non vérifié</span>`;
  const vieux = ev.verifie_le && ecartJours(ev.verifie_le, AUJ()) > 30;
  return vieux ? `<span class="badge b-nv">⚠ vérifié le ${dateCourte(ev.verifie_le)}, à revérifier</span>` : `<span class="badge b-v">✓ vérifié</span>`;
}

/* ═══ 7. Navigation ══════════════════════════════════════════════════════════ */
const VUES = ["accueil", "calendrier", "bourses", "portefeuille", "fomo", "journal", "plan"];
function aller(vue, opts = {}) {
  if (!VUES.includes(vue)) vue = "accueil";
  $$("nav.tabs button").forEach((b) => b.setAttribute("aria-current", b.dataset.vue === vue ? "page" : "false"));
  VUES.forEach((v) => { $("#v-" + v).hidden = v !== vue; });
  if (location.hash.slice(1) !== vue) history.replaceState(null, "", "#" + vue);
  RENDU[vue](opts);
  if (!opts.garderScroll) window.scrollTo(0, 0);
}
$$("nav.tabs button").forEach((b) => b.addEventListener("click", () => aller(b.dataset.vue)));
window.addEventListener("hashchange", () => aller(location.hash.slice(1)));

/* ═══ 8. Vue Aujourd'hui ═════════════════════════════════════════════════════ */
function prochains(jours) {
  const a = AUJ(), fin = ajoutJours(a, jours), v = valorisation();
  return EVENTS.filter((e) => { const d = dateEvt(e); return d >= a && d <= fin; }).map((e) => ({ e, an: analyse(e, v) }));
}

function rendreAccueil() {
  const v = valorisation();
  const sept = prochains(7).sort((x, y) => y.an.score - x.an.score).slice(0, 3);
  const mois = prochains(30).filter((x) => x.an.niveau !== "faible").sort((x, y) => dateEvt(x.e).localeCompare(dateEvt(y.e)));
  const V = versementPour(AUJ().slice(0, 7));
  const sug = suggestionDCA(V);
  const al = alertesPortefeuille(v);
  // Résumé du jour : lisible en 5 secondes
  const aujEvts = prochains(0).filter(({ an }) => an.niveau !== "faible");
  const prochainFort = prochains(45).filter(({ an }) => an.niveau === "fort").sort((x, y) => dateEvt(x.e).localeCompare(dateEvt(y.e)))[0];
  let titre, ton, sous;
  if (!v.complet) { titre = "Bienvenue : 2 minutes pour démarrer"; ton = "info"; sous = "Saisis le cours de tes 5 lignes : tous les calculs passeront de ton allocation cible à ton portefeuille réel."; }
  else if (aujEvts.length) { titre = "Aujourd'hui : un événement à suivre, aucune action à prendre"; ton = "surv"; sous = `${esc(aujEvts[0].e.titre)} — ${esc(aujEvts[0].an.verdict.titre.toLowerCase())}.`; }
  else { titre = "Aujourd'hui : rien à faire. Continue ton DCA."; ton = "ok"; sous = "Aucun événement important pour toi aujourd'hui. C'est le cas le plus fréquent, et c'est une bonne nouvelle."; }
  const progres = v.complet ? Math.min(100, v.total / S.plan.objectif * 100) : null;
  const motsCles = Object.keys(GLOSSAIRE), jourN = Math.floor(new Date(AUJ() + "T12:00:00Z") / 864e5);
  const mot = motsCles[jourN % motsCles.length];
  $("#v-accueil").innerHTML = `
    <div class="card resume r-${ton}">
      <p class="small muted">${dateLongue(AUJ())}</p>
      <h1>${ton === "ok" ? "✓ " : ""}${titre}</h1>
      <p>${sous}</p>
      <ul class="faits">
        ${V > 0 ? `<li><span aria-hidden="true">💶</span> Versement du mois : <b>${eur(V)}</b>${sug ? ` → <b>${esc(sug.ligne.nom)}</b>` : ""}</li>` : `<li><span aria-hidden="true">⏸</span> Pas de versement prévu ce mois-ci (pause du plan).</li>`}
        ${prochainFort ? `<li><span aria-hidden="true">📅</span> Prochain rendez-vous important pour toi : <button type="button" class="lien" data-ev="${esc(prochainFort.e.id)}">${esc(prochainFort.e.titre)}</button>, ${dateCourte(dateEvt(prochainFort.e))}</li>` : ""}
        ${progres != null ? `<li><span aria-hidden="true">🧭</span> Cap 2046 : <b>${pct(progres, 1)}</b> de ton objectif de ${eur(S.plan.objectif)}<span class="jauge"><i style="width:${Math.max(0.5, progres)}%"></i></span></li>` : ""}
      </ul>
      ${!v.complet ? `<div class="btns"><button type="button" class="btn p" data-go="portefeuille">Saisir mes cours</button><button type="button" class="btn" id="revoir-guide">Visite guidée</button></div>` : ""}
    </div>
    <div class="card semaine">
      <h2>Dans les 7 prochains jours</h2>
      ${sept.length ? `<ol>${sept.map(({ e, an }) => `
        <li><button type="button" data-ev="${esc(e.id)}">
          <span class="small muted">${dateCourte(dateEvt(e))}${e.datetime_utc ? " · " + heureEvt(e).txt : ""}</span>
          <strong>${esc(e.titre)}</strong>
          <span>${badgeImpact(an.niveau)} <span class="small">${esc(an.verdict.titre)}</span> ${e.verifie ? "" : badgeVerif(e)}</span>
        </button></li>`).join("")}</ol>` : `<p class="muted">Aucun événement notable cette semaine. Continue ton plan.</p>`}
    </div>

    <div class="card dca">
      <h2>Ton prochain versement</h2>
      ${V <= 0 ? `<p>Versement prévu ce mois-ci : <b>0 €</b> (pause selon ton plan). Rien à faire.</p>`
        : sug ? `<p><b>${eur(V)}</b> prévus ce mois-ci → <b>${esc(sug.ligne.nom)}</b>, la ligne la plus ${g("sous-pondérée")} (il lui manque ${eur(sug.manque)} pour atteindre sa ${g("cible")}).</p>
                <p class="small muted">Soit ${sug.parts} part${sug.parts > 1 ? "s" : ""} au cours saisi de ${eur(sug.ligne.cours, 2)}, reste ${eur(sug.reste, 2)}.</p>`
        : `<p><b>${eur(V)}</b> prévus ce mois-ci. Saisis tes cours dans l'onglet Portefeuille pour savoir sur quelle ligne les placer.</p>`}
    </div>

    ${BOURSES.bourses.length ? (() => { const t = new Date(), pe = BOURSES.bourses.find((b) => b.id === "paris-etf"), ny = BOURSES.bourses.find((b) => b.id === "newyork");
      const sp = statutBourse(pe, t), sn = statutBourse(ny, t), f = sug ? fenetre(sug.ligne.id, isoParis(t)) : null;
      return `<div class="card"><h2>Bourses maintenant</h2><div class="mini-bourse">
        <span>Paris (ETF) : <b>${esc(sp.libelle)}</b>${sp.change ? ` · ${esc(sp.verbe)} ${duree(sp.change - t)}` : ""}</span>
        <span>New York : <b>${esc(sn.libelle)}</b>${sn.change ? ` · ${esc(sn.verbe)} ${duree(sn.change - t)}` : ""}</span></div>
        ${f && !f.ferme ? `<p class="small">Meilleure fenêtre aujourd'hui pour ${esc(sug.ligne.nom)} : <b>${hm(f.debut, TZ)}–${hm(f.fin, TZ)}</b> (Paris).</p>` : ""}
        <div class="btns"><button type="button" class="btn" data-go="bourses">Toutes les bourses</button></div></div>`; })() : ""}
    ${al.length ? `<div class="card"><h2>À regarder</h2>${al.map((a) => `<div class="alerte ${a.niveau}">${a.html}</div>`).join("")}</div>` : ""}

    <div class="card mot"><p class="small muted">Le mot du jour</p><h2>${esc(mot)}</h2><p>${esc(GLOSSAIRE[mot])}</p>
      <p class="small muted">Un nouveau terme chaque jour. Pour aller plus loin : l'Académie de la ${VEILLE_DISPO ? `<a href="/veille/academie.html">veille IA</a>` : "veille IA (sur ton site Netlify)"}.</p></div>

    <div class="card">
      <h2>Les 30 prochains jours qui te concernent</h2>
      ${mois.length ? mois.map(({ e, an }) => ligneEvt(e, an)).join("") : `<p class="muted">Rien d'impact moyen ou fort sur 30 jours.</p>`}
      <div class="btns"><button type="button" class="btn" data-go="calendrier">Tout le calendrier</button></div>
    </div>`;
  $$("#v-accueil [data-ev]").forEach((b) => b.addEventListener("click", () => ouvrirEvt(b.dataset.ev)));
  $$("#v-accueil [data-go]").forEach((b) => b.addEventListener("click", () => aller(b.dataset.go)));
  const rg = $("#revoir-guide"); if (rg) rg.addEventListener("click", ouvrirGuide);
}

function ligneEvt(e, an, actif = false) {
  const d = dateEvt(e), dd = new Date(d + "T12:00:00Z");
  return `<button type="button" class="ev i-${an.niveau}" data-ev="${esc(e.id)}" ${actif ? 'aria-current="true"' : ""}>
    <span class="d">${JOURS_C[dd.getUTCDay()]}<b>${dd.getUTCDate()} ${MOIS_C[dd.getUTCMonth()]}</b>${e.datetime_utc ? heureEvt(e).txt : ""}</span>
    <span><span class="t">${esc(e.titre)}</span>
      <span class="m">${badgeImpact(an.niveau)}<span class="badge b-cat">${esc(CATS[e.categorie] || e.categorie)}</span>${e.verifie ? "" : badgeVerif(e)}</span>
      <span class="small muted">${esc(an.verdict.titre)}</span></span>
  </button>`;
}

/* ═══ 9. Vue Calendrier ══════════════════════════════════════════════════════ */
const UI = { horizon: 92, aff: "mois", cats: new Set(Object.keys(CATS)), imp: "tous", moi: false, mois: null, jour: null, sel: null };

function filtres(e, an) {
  if (!UI.cats.has(e.categorie)) return false;
  if (UI.imp === "fort" && an.niveau !== "fort") return false;
  if (UI.imp === "moyen" && an.niveau === "faible") return false;
  if (UI.moi && an.expo <= 0 && e.categorie !== "marche") return false;
  if (UI.moi && e.categorie === "marche") return false;
  return true;
}

function rendreCalendrier() {
  if (!UI.mois) UI.mois = AUJ().slice(0, 7);
  const v = valorisation();
  const tous = EVENTS.map((e) => ({ e, an: analyse(e, v) })).filter(({ e, an }) => filtres(e, an));
  // Filtres
  $("#f-cat").innerHTML = Object.entries(CATS).map(([k, n]) => `<button type="button" class="chip" data-cat="${k}" aria-pressed="${UI.cats.has(k)}">${esc(n)}</button>`).join("");
  $("#f-imp").innerHTML = [["tous", "Toutes importances"], ["moyen", "Moyen et fort"], ["fort", "Fort seulement"]]
    .map(([k, n]) => `<button type="button" class="chip" data-imp="${k}" aria-pressed="${UI.imp === k}">${n}</button>`).join("");
  $("#f-moi").checked = UI.moi;
  $$("[data-aff]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.aff === UI.aff));
  // Mois
  const cm = $("#cal-mois");
  if (UI.aff === "mois") {
    const [y, m] = UI.mois.split("-").map(Number);
    const premier = new Date(Date.UTC(y, m - 1, 1)), decal = (premier.getUTCDay() + 6) % 7;
    const debut = ajoutJours(UI.mois + "-01", -decal);
    const parJour = {};
    for (const x of tous) (parJour[dateEvt(x.e)] ||= []).push(x);
    let cases = "";
    for (let i = 0; i < 42; i++) {
      const d = ajoutJours(debut, i);
      if (i >= 35 && d.slice(0, 7) !== UI.mois) break;
      const evs = parJour[d] || [];
      cases += `<button type="button" class="jour ${d.slice(0, 7) !== UI.mois ? "hors" : ""} ${d === AUJ() ? "auj" : ""}" data-jour="${d}" aria-pressed="${UI.jour === d}"
        aria-label="${dateLongue(d)} : ${evs.length} événement${evs.length > 1 ? "s" : ""}"><span>${+d.slice(8)}</span>
        <span class="pts">${evs.slice(0, 6).map((x) => `<i class="pt ${x.an.niveau}"></i>`).join("")}</span></button>`;
    }
    cm.innerHTML = `<div class="mois-nav"><button type="button" data-mois="-1" aria-label="Mois précédent">‹</button><strong>${moisLong(UI.mois)}</strong><button type="button" data-mois="1" aria-label="Mois suivant">›</button></div>
      <div class="grille">${["lun", "mar", "mer", "jeu", "ven", "sam", "dim"].map((j) => `<span class="jsem">${j}</span>`).join("")}${cases}</div>
      <p class="legende" style="margin-top:8px"><span><i style="background:var(--fort)"></i>impact fort</span><span><i style="background:var(--moyen)"></i>moyen</span><span><i style="background:var(--faible)"></i>faible</span></p>`;
  } else cm.innerHTML = "";
  // Liste
  const a = AUJ();
  let liste = UI.jour ? tous.filter((x) => dateEvt(x.e) === UI.jour)
    : UI.aff === "mois" ? tous.filter((x) => dateEvt(x.e).slice(0, 7) === UI.mois && dateEvt(x.e) >= (UI.mois === a.slice(0, 7) ? a : ""))
    : tous.filter((x) => dateEvt(x.e) >= a && dateEvt(x.e) <= ajoutJours(a, UI.horizon));
  const resteApres = UI.aff === "liste" && !UI.jour && tous.some((x) => dateEvt(x.e) > ajoutJours(a, UI.horizon));
  liste.sort((x, y) => (dateEvt(x.e) + (x.e.datetime_utc || "")).localeCompare(dateEvt(y.e) + (y.e.datetime_utc || "")));
  let html = "", semaine = "";
  for (const x of liste) {
    const d = dateEvt(x.e), lundi = ajoutJours(d, -((new Date(d + "T12:00:00Z").getUTCDay() + 6) % 7));
    if (lundi !== semaine) { semaine = lundi; html += `<p class="semaine-titre">Semaine du ${dateCourte(lundi)}</p>`; }
    html += ligneEvt(x.e, x.an, x.e.id === UI.sel);
  }
  $("#cal-liste").innerHTML = `<div class="card"><div class="barre-outils"><h2 style="margin:0">${UI.jour ? dateLongue(UI.jour) : UI.aff === "mois" ? "Événements de " + moisLong(UI.mois) : `Les ${Math.round(UI.horizon / 30.5)} prochains mois`}</h2>
    ${UI.jour ? `<button type="button" class="btn" id="tout-voir">Tout le mois</button>` : ""}</div>${html || `<p class="muted">Aucun événement pour ces filtres.</p>`}
    ${resteApres ? `<div class="btns"><button type="button" class="btn" id="plus-loin">Voir 3 mois de plus</button></div>` : ""}</div>`;
  // Détail
  rendreDetail(UI.sel ? EVENTS.find((e) => e.id === UI.sel) : null);
  // Récapitulatif
  const futurs = tous.filter((x) => dateEvt(x.e) >= a && dateEvt(x.e) <= ajoutJours(a, UI.horizon)).sort((x, y) => dateEvt(x.e).localeCompare(dateEvt(y.e)));
  $("#recap").innerHTML = `<table><thead><tr><th>Date</th><th>Événement</th><th>Impact</th><th>Verdict</th><th>Source</th></tr></thead><tbody>
    ${futurs.map(({ e, an }) => `<tr class="cliquable" data-ev="${esc(e.id)}"><td class="n">${dateCourte(dateEvt(e))}</td><td>${esc(e.titre)}</td><td>${badgeImpact(an.niveau)}</td><td>${esc(an.verdict.titre)}</td><td>${badgeVerif(e)}</td></tr>`).join("")}
    </tbody></table>`;
  // À confirmer
  $("#a-confirmer").innerHTML = A_CONFIRMER.length ? `<h2>Dates attendues, pas encore confirmées</h2>
    <p class="small muted">Ces publications arrivent mais leur date n'a pas pu être lue sur la source officielle. Elles apparaîtront dans le calendrier une fois confirmées.</p>
    <div class="tscroll"><table><thead><tr><th>Société</th><th>Publication</th><th>Période habituelle</th><th>Ton exposition</th><th>Source</th></tr></thead><tbody>
    ${A_CONFIRMER.map((c) => { const an = analyse({ categorie: "resultats", societes: [c.societe], importance: c.importance }, v);
      return `<tr><td><b>${esc(c.societe)}</b></td><td>${esc(c.evenement)}</td><td>${esc(c.periode_habituelle)} <span class="badge b-nv">⚠ non vérifié</span></td><td>${pct(an.expo * 100, 2)}</td><td><a href="${esc(c.source_url)}" target="_blank" rel="noopener">page officielle</a></td></tr>`; }).join("")}
    </tbody></table></div>` : "";
  // Évènements
  $$("#f-cat [data-cat]").forEach((b) => b.addEventListener("click", () => { const k = b.dataset.cat; UI.cats.has(k) ? UI.cats.delete(k) : UI.cats.add(k); if (!UI.cats.size) Object.keys(CATS).forEach((c) => UI.cats.add(c)); rendreCalendrier(); }));
  $$("#f-imp [data-imp]").forEach((b) => b.addEventListener("click", () => { UI.imp = b.dataset.imp; rendreCalendrier(); }));
  $$("[data-mois]").forEach((b) => b.addEventListener("click", () => { const [y, m] = UI.mois.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + +b.dataset.mois, 1)); UI.mois = d.toISOString().slice(0, 7); UI.jour = null; rendreCalendrier(); }));
  $$("[data-jour]").forEach((b) => b.addEventListener("click", () => { UI.jour = UI.jour === b.dataset.jour ? null : b.dataset.jour; rendreCalendrier(); }));
  const tv = $("#tout-voir"); if (tv) tv.addEventListener("click", () => { UI.jour = null; rendreCalendrier(); });
  const pl = $("#plus-loin"); if (pl) pl.addEventListener("click", () => { UI.horizon += 92; rendreCalendrier(); });
  $$("#cal-liste [data-ev], #recap [data-ev]").forEach((b) => b.addEventListener("click", () => { UI.sel = b.dataset.ev; rendreCalendrier(); $("#detail").classList.add("ouvert"); if (window.innerWidth >= 900) $("#detail").scrollIntoView({ block: "nearest" }); }));
}
$("#f-moi").addEventListener("change", (e) => { UI.moi = e.target.checked; rendreCalendrier(); });
$$("[data-aff]").forEach((b) => b.addEventListener("click", () => { UI.aff = b.dataset.aff; UI.jour = null; rendreCalendrier(); }));

function ouvrirEvt(id) {
  const e = EVENTS.find((x) => x.id === id);
  if (!e) return;
  UI.sel = id; UI.mois = dateEvt(e).slice(0, 7); UI.jour = null;
  aller("calendrier");
  $("#detail").classList.add("ouvert");
}

function rendreDetail(e) {
  const box = $("#detail");
  if (!e) { box.classList.remove("ouvert"); box.innerHTML = `<p class="vide">Choisis un événement pour voir pourquoi il compte, ton exposition et le verdict.</p>`; return; }
  const v = valorisation(), an = analyse(e, v), h = heureEvt(e);
  box.innerHTML = `
    <button type="button" class="retour" id="retour">← Retour à la liste</button>
    <p class="small muted">${esc(CATS[e.categorie] || e.categorie)} · importance générale ${esc(IMP[e.importance] || "")}</p>
    <h2>${esc(e.titre)}</h2>
    <p><b>${dateLongue(dateEvt(e))}</b>${e.datetime_utc ? ` à <b>${h.txt}</b> (Paris) <span class="small muted">— ${h.note}</span>` : ` <span class="small muted">— ${h.txt}</span>`}</p>
    <div>${badgeImpact(an.niveau)} ${badgeVerif(e)}</div>
    <div class="verdict v-${an.verdict.code}"><strong>${esc(an.verdict.titre)}</strong>${an.verdict.raison}</div>
    <h3>Pourquoi ça peut bouger les marchés</h3>
    <p>${esc(e.description)}</p>
    <div class="scen"><div><b>Scénario favorable</b><br>${esc(e.haussier)}</div><div><b>Scénario défavorable</b><br>${esc(e.baissier)}</div></div>
    <h3 style="margin-top:14px">Tes positions exposées</h3>
    ${an.detail.length ? `<div class="tscroll"><table><thead><tr><th>Ligne</th><th class="n">${g("poids", "Poids")}</th><th class="n">Part exposée</th><th class="n">Contribution</th></tr></thead><tbody>
      ${an.detail.map((d) => `<tr><td>${esc(d.nom)}${d.verifie ? "" : ` <span class="badge b-nv">⚠ composition non vérifiée</span>`}</td><td class="n">${pct(d.poids)}</td><td class="n">${pct(d.part * 100, d.part < 0.1 ? 1 : 0)}</td><td class="n">${pct(d.contribution, 1)}</td></tr>`).join("")}
      <tr><td><b>Total exposé</b></td><td></td><td></td><td class="n"><b>${pct(an.expo * 100, 1)}</b></td></tr></tbody></table></div>
      <p class="small muted">${an.modeCible ? "Calcul sur ton allocation cible (cours non saisis). " : "Calcul sur tes poids réels. "}Contribution = poids de la ligne × part de la ligne exposée (${g("transparisation")}).</p>`
      : `<p class="muted">Aucune de tes lignes n'est directement exposée (effet indirect possible via le sentiment de marché).</p>`}
    <h3>Source</h3>
    <p><a href="${esc(e.source_url)}" target="_blank" rel="noopener">${esc(e.source_nom)}</a><br>
    <span class="small">${e.verifie ? `Vérifié le ${dateCourte(e.verifie_le)}.` : `<b>Non vérifié.</b>`} ${esc(e.note_verification || "")}</span></p>
    <div class="btns">
      <button type="button" class="btn p" id="noter">Noter ma décision</button>
      <button type="button" class="btn" id="reagir">J'ai envie de réagir</button>
    </div>`;
  $("#retour").addEventListener("click", () => { UI.sel = null; box.classList.remove("ouvert"); rendreCalendrier(); });
  $("#noter").addEventListener("click", () => { box.classList.remove("ouvert"); aller("journal", { evt: e.id }); });
  $("#reagir").addEventListener("click", () => { box.classList.remove("ouvert"); aller("fomo", { evt: e.id }); });
}

/* ═══ 10. Vue Portefeuille ═══════════════════════════════════════════════════ */
function rendrePortefeuille() {
  const v = valorisation();
  const V = versementPour(AUJ().slice(0, 7));
  const sug = suggestionDCA(V);
  const al = alertesPortefeuille(v);
  // Transparisation : pays et entreprises
  const zones = {}, socs = {};
  let compoVerif = true;
  for (const l of v.lignes) {
    const c = ETF.lignes[l.id]; if (!c) continue;
    if (!c.verifie) compoVerif = false;
    for (const [z, w] of Object.entries(c.zones)) zones[z] = (zones[z] || 0) + l.poidsCalc * w / 100;
    for (const [s, w] of Object.entries(c.societes)) socs[s] = (socs[s] || 0) + l.poidsCalc * w / 100;
  }
  const maxPoids = Math.max(...v.lignes.map((l) => Math.max(l.poidsCalc, l.cible)), 1);
  $("#v-portefeuille").innerHTML = `
    <div class="kpis">
      <div class="kpi"><span class="v">${v.complet ? eur(v.total) : "—"}</span><span class="l">Valeur totale</span></div>
      <div class="kpi"><span class="v">${eur(V)}</span><span class="l">Versement de ce mois (plan)</span></div>
      <div class="kpi"><span class="v">${v.lignes.length}</span><span class="l">Lignes</span></div>
      <div class="kpi"><span class="v">${pct(S.plafond_ligne, 0)}</span><span class="l">${g("plafond", "Plafond")} par action</span></div>
    </div>
    <div class="card dca"><h2>Prochain versement suggéré</h2>
      ${V <= 0 ? `<p>Pause prévue ce mois-ci par ton plan.</p>` : sug ? `<p><b>${eur(V)} → ${esc(sug.ligne.nom)}</b> : c'est la ligne la plus ${g("sous-pondérée")} parmi celles que tu renforces encore (il lui manque ${eur(sug.manque)}). ${sug.parts} part${sug.parts > 1 ? "s" : ""} à ${eur(sug.ligne.cours, 2)}.</p>`
        : `<p>Saisis tous les cours pour obtenir la suggestion.</p>`}
      <p class="small muted">Règle : le ${g("DCA")} va entièrement sur la ligne dont il manque le plus d'euros pour atteindre sa cible. Saint-Gobain et le Nasdaq-100 sont exclus (tu ne les renforces plus).</p>
    </div>
    ${al.map((a) => `<div class="alerte ${a.niveau}">${a.html}</div>`).join("")}
    <div class="card"><h2>Positions</h2>
      <p class="small muted">Saisis le cours affiché dans ton appli Fortuneo (30 secondes). Tout est enregistré sur cet appareil uniquement.</p>
      <div class="lignes">${v.lignes.map((l, i) => `
        <div class="ligne">
          <div class="ligne-h"><b>${esc(l.nom)}</b><span class="num">${l.valeur != null ? eur(l.valeur) : "cours à saisir"}</span></div>
          ${l.note ? `<div class="small muted">${esc(l.note)}</div>` : ""}
          <div class="champs">
            <label>Parts<input type="number" inputmode="decimal" min="0" step="any" data-i="${i}" data-k="parts" value="${esc(l.parts)}"></label>
            <label>Cours (€)<input type="number" inputmode="decimal" min="0" step="any" data-i="${i}" data-k="cours" value="${l.cours ?? ""}" placeholder="ex. 12,34"></label>
            <label>Cible (%)<input type="number" inputmode="decimal" min="0" max="100" step="any" data-i="${i}" data-k="cible" value="${esc(l.cible)}"></label>
          </div>
          <div class="barre" role="img" aria-label="Poids ${l.poids != null ? pct(l.poids) : "inconnu"}, cible ${pct(l.cible, 0)}">
            ${l.poids != null ? `<span class="r" style="width:${(l.poids / maxPoids) * 100}%"></span>` : ""}<span class="c" style="left:calc(${(l.cible / maxPoids) * 100}% - 1px)"></span></div>
          <div class="small num">${g("poids", "Poids réel")} <b>${pct(l.poids)}</b> · ${g("cible", "cible")} ${pct(l.cible, 0)} · ${g("écart", "écart")} <b>${pts(l.ecart)}</b>${l.cours_le ? ` · cours du ${dateCourte(l.cours_le)}` : ""}</div>
        </div>`).join("")}</div>
      <p class="legende"><span><i style="background:var(--s1)"></i>poids réel</span><span><i style="background:var(--ink)"></i>cible</span></p>
      <label class="champ" style="margin-top:10px">Espèces sur le PEA (€)<input type="number" inputmode="decimal" min="0" step="any" id="especes" value="${esc(S.especes)}"></label>
    </div>
    <div class="card"><h2>Tableau des écarts</h2><div class="tscroll"><table>
      <thead><tr><th>Ligne</th><th class="n">Valeur</th><th class="n">Poids</th><th class="n">Cible</th><th class="n">Écart</th><th class="n">Pour revenir à la cible</th></tr></thead>
      <tbody>${v.lignes.map((l) => `<tr><td>${esc(l.nom)}</td><td class="n">${eur(l.valeur)}</td><td class="n">${pct(l.poids)}</td><td class="n">${pct(l.cible, 0)}</td><td class="n">${pts(l.ecart)}</td><td class="n">${v.complet ? (l.cible / 100 * v.total - l.valeur > 0 ? "+" : "") + eur(l.cible / 100 * v.total - l.valeur) : "—"}</td></tr>`).join("")}
      <tr><td><b>Total</b></td><td class="n"><b>${eur(v.total)}</b></td><td class="n">${v.complet ? pct(v.lignes.reduce((a, l) => a + l.poids, 0)) : "—"}</td><td class="n">${pct(v.sommeCibles, 0)}</td><td></td><td></td></tr></tbody></table></div>
      <p class="small muted">« Pour revenir à la cible » : montant théorique. Ton plan corrige par les versements, sans vendre.</p></div>
    <div class="card"><h2>Ce que tu détiens vraiment (${g("transparisation")})</h2>
      ${compoVerif ? "" : `<div class="alerte">Compositions d'ETF <b>non vérifiées</b> : ordres de grandeur en attendant les factsheets officielles (voir onglet Plan).</div>`}
      <div class="grid2"><div><h3>Par pays</h3><table><tbody>${Object.entries(zones).sort((a, b) => b[1] - a[1]).map(([z, w]) => `<tr><td>${esc(ETF.noms_zones[z] || z)}</td><td class="n">${pct(w)}</td></tr>`).join("")}</tbody></table></div>
      <div><h3>Entreprises suivies</h3><table><tbody>${Object.entries(socs).sort((a, b) => b[1] - a[1]).map(([s, w]) => `<tr><td>${esc(s)}</td><td class="n">${pct(w, 2)}</td></tr>`).join("")}</tbody></table></div></div>
      <p class="small muted">${v.complet ? "Sur tes poids réels." : "Sur ton allocation cible (cours non saisis)."}</p>
    </div>`;
  $$("#v-portefeuille input[data-i]").forEach((inp) => inp.addEventListener("change", () => {
    const p = S.positions[+inp.dataset.i], k = inp.dataset.k;
    const val = inp.value.trim() === "" ? null : parseFloat(inp.value.replace(",", "."));
    if (val != null && (!isFinite(val) || val < 0)) { toast("Valeur invalide"); inp.value = p[k] ?? ""; return; }
    p[k] = k === "cours" ? val : val ?? 0;
    if (k === "cours") p.cours_le = val ? AUJ() : null;
    sauver(); rendrePortefeuille(); majEntete();
  }));
  $("#especes").addEventListener("change", (e) => { const x = parseFloat(e.target.value.replace(",", ".")); S.especes = isFinite(x) && x >= 0 ? x : 0; sauver(); rendrePortefeuille(); });
}

/* ═══ 11. Vue Anti-FOMO ══════════════════════════════════════════════════════ */
const FOMO = { actu: "", produit: "", sens: "acheter", plan: "", pea: "", levier: "", deja: "", montant: "", perte: "", attendre: "" };
function rendreFomo(opts = {}) {
  if (opts.evt) { const e = EVENTS.find((x) => x.id === opts.evt); if (e) FOMO.actu = e.titre; }
  const v = valorisation();
  const radio = (k, opts2) => `<div class="choix">${opts2.map(([val, lib]) => `<label><input type="radio" name="${k}" value="${val}" ${FOMO[k] === val ? "checked" : ""}> ${lib}</label>`).join("")}</div>`;
  $("#v-fomo").innerHTML = `
    <div class="card"><h2>Tu as envie de réagir à une actu ?</h2>
      <p>Réponds honnêtement. Le verdict tombe à la fin. C'est ton garde-fou contre le ${g("FOMO")} et le ${g("market timing")}.</p>
      <form id="ffomo" autocomplete="off">
        <label class="champ">1. Qu'est-ce qui te donne envie d'agir ?<input type="text" name="actu" value="${esc(FOMO.actu)}" placeholder="ex. Nvidia +8 % après ses résultats"></label>
        <label class="champ">2. Quel produit veux-tu acheter ou vendre ?<input type="text" name="produit" value="${esc(FOMO.produit)}" placeholder="ex. action Nvidia"></label>
        <fieldset><legend>Acheter ou vendre ?</legend>${radio("sens", [["acheter", "Acheter"], ["vendre", "Vendre"]])}</fieldset>
        <fieldset><legend>3. Est-ce prévu dans ton plan (allocation cible) ?</legend>${radio("plan", [["oui", "Oui"], ["non", "Non"]])}</fieldset>
        <fieldset><legend>4. Est-ce éligible au ${g("PEA")} ?</legend>${radio("pea", [["oui", "Oui"], ["non", "Non"], ["nsp", "Je ne sais pas"]])}</fieldset>
        <fieldset><legend>5. Le produit utilise-t-il un ${g("effet de levier")} ?</legend>${radio("levier", [["non", "Non"], ["oui", "Oui"], ["nsp", "Je ne sais pas"]])}</fieldset>
        <fieldset><legend>6. Es-tu déjà exposé via tes ETF ?</legend>
          <div id="fomo-expo"></div>
          ${radio("deja", [["oui", "Oui"], ["non", "Non"], ["nsp", "Je ne sais pas"]])}</fieldset>
        <div class="grid2">
          <label class="champ">7. Montant envisagé (€)<input type="number" inputmode="decimal" min="0" step="any" name="montant" value="${esc(FOMO.montant)}"></label>
          <label class="champ">8. Perte maximale acceptable sur ce montant (€)<input type="number" inputmode="decimal" min="0" step="any" name="perte" value="${esc(FOMO.perte)}"></label>
        </div>
        <fieldset><legend>9. Peux-tu attendre 72 heures avant de décider ?</legend>${radio("attendre", [["oui", "Oui"], ["non", "Non, c'est urgent"]])}</fieldset>
      </form>
    </div>
    <div class="card" id="fomo-verdict"></div>`;
  const form = $("#ffomo"), boite = $("#fomo-verdict");
  let dernier = "", dernierExpo = "";
  const maj = () => {
    const fd = new FormData(form);
    for (const k of Object.keys(FOMO)) FOMO[k] = fd.get(k) ?? "";
    const ex = expoCitee(v);
    if (ex !== dernierExpo) { $("#fomo-expo").innerHTML = ex; dernierExpo = ex; }
    const html = verdictFomo(v);
    if (html !== dernier) { boite.innerHTML = html; dernier = html; }  // pas de redessin inutile : un clic n'est jamais perdu
  };
  // Le focus peut faire défiler la page entre l'appui et le relâchement : l'appui commencé sur le bouton suffit.
  let arme = false;
  boite.addEventListener("pointerdown", (e) => { arme = !!e.target.closest("#fomo-save"); });
  boite.addEventListener("click", (e) => { if (e.target.closest("#fomo-save") || arme) { arme = false; enregistrerFomo(); } });
  form.addEventListener("input", maj); form.addEventListener("change", maj);
  form.addEventListener("submit", (e) => e.preventDefault());
  maj();
}

function expoCitee(v) {
  const toutes = Object.keys(Object.assign({}, ...Object.values(ETF.lignes || {}).map((c) => c.societes || {})));
  const txt = (FOMO.produit + " " + FOMO.actu).toLowerCase();
  const cite = toutes.filter((s) => txt.includes(s.toLowerCase()));
  if (!cite.length) return "";
  const x = cite.map((s) => ({ s, w: v.lignes.reduce((a, l) => a + l.poidsCalc * ((ETF.lignes[l.id] && ETF.lignes[l.id].societes[s]) || 0) / 100, 0) }));
  return `<p class="small">D'après la composition de tes lignes : ${x.map((y) => `<b>${esc(y.s)}</b> ≈ ${pct(y.w, 2)} de ton portefeuille`).join(", ")} <span class="badge b-nv">⚠ composition non vérifiée</span></p>`;
}

function verdictFomo(v) {
  const F = FOMO, raisons = [];
  const repondu = ["plan", "pea", "levier", "deja", "attendre"].filter((k) => F[k]).length + (F.montant !== "" ? 1 : 0) + (F.perte !== "" ? 1 : 0);
  if (repondu < 7) return `<h2>Verdict</h2><p class="muted">Réponds aux ${7 - repondu} question${7 - repondu > 1 ? "s" : ""} restante${7 - repondu > 1 ? "s" : ""}.</p>`;
  const montant = +F.montant || 0, perte = +F.perte || 0;
  const isole = /action|titre|nvidia|apple|tesla|microsoft|amazon|crypto|bitcoin/i.test(F.produit) && !/etf/i.test(F.produit);
  const choc = isole ? 0.5 : 0.35; // baisse plausible : 50 % pour une action isolée, 35 % pour un ETF actions
  const pertePossible = montant * choc;
  const poidsApres = v.complet && montant > 0 ? (montant / (v.total + montant)) * 100 : null;
  let code = "ok";
  if (F.levier === "oui") { code = "non"; raisons.push(`Ton plan exclut l'${g("effet de levier")}.`); }
  if (F.pea === "non") { code = "non"; raisons.push("Hors PEA : c'est exactement le « produit hors PEA par FOMO » que tes règles excluent."); }
  if (F.sens === "vendre") { code = "non"; raisons.push("Vendre sur une actualité, c'est du market timing : ton plan est un DCA de long terme."); }
  if (F.plan === "non") { code = "non"; raisons.push("Ce n'est pas dans ton plan. Si l'idée tient encore dans 30 jours, modifie d'abord ton plan, à froid."); }
  if (isole && F.sens === "acheter") { code = code === "ok" ? "attendre" : code; raisons.push("Tes règles excluent le pari sur une action isolée sur un coup de tête."); }
  if (poidsApres != null && isole && poidsApres > S.plafond_ligne) { code = "non"; raisons.push(`Cela ferait ${pct(poidsApres)} de ton portefeuille, au-dessus de ton plafond de ${pct(S.plafond_ligne, 0)}.`); }
  if (montant > 0 && pertePossible > perte) { code = code === "ok" ? "attendre" : code; raisons.push(`Une baisse de ${pct(choc * 100, 0)} (courante pour ce type de produit) te ferait perdre ${eur(pertePossible)}, plus que les ${eur(perte)} que tu acceptes.`); }
  if (F.deja === "oui") raisons.push("Tu es déjà exposé via tes ETF : acheter en plus augmente une concentration que tu as déjà.");
  if (F.pea === "nsp" || F.levier === "nsp" || F.deja === "nsp") { code = code === "ok" ? "attendre" : code; raisons.push("Tu ne connais pas toutes les réponses : on n'investit pas dans ce qu'on ne sait pas décrire."); }
  if (F.attendre === "non") { code = code === "ok" ? "attendre" : code; raisons.push("Si ça ne peut pas attendre 72 heures, c'est l'émotion qui décide, pas ton plan."); }
  const T = { non: ["v-revoir", "Non. Tu ne le fais pas."], attendre: ["v-surv", "Pas maintenant. Attends 72 heures et relis ce verdict."], ok: ["v-rien", "Cohérent avec ton plan : passe par ton prochain versement programmé, pas dans l'urgence."] }[code];
  if (!raisons.length) raisons.push("Toutes les réponses sont compatibles avec ton plan et tes règles.");
  return `<h2>Verdict</h2><div class="verdict ${T[0]}"><strong>${T[1]}</strong><ul>${raisons.map((r) => `<li>${r}</li>`).join("")}</ul></div>
    <div class="btns"><button type="button" class="btn p" id="fomo-save">Enregistrer dans mon journal</button></div>`;
}

function enregistrerFomo() {
  const v = $("#fomo-verdict .verdict strong");
  S.journal.push({ id: Date.now().toString(36), date: AUJ(), evt: null, titre: FOMO.actu || "Envie de réagir", decision: v && v.textContent.startsWith("Non") ? "Ne rien faire" : v && v.textContent.startsWith("Pas") ? "Surveiller" : "Acheter via le DCA",
    raison: `Checklist anti-FOMO : ${v ? v.textContent : ""} (produit : ${FOMO.produit || "?"}, montant : ${FOMO.montant || 0} €)`, ressenti: "FOMO", source: "anti-fomo" });
  sauver(); toast("Enregistré dans le journal");
}

/* ═══ 12. Vue Journal ════════════════════════════════════════════════════════ */
const DECISIONS = ["Ne rien faire", "Surveiller", "Rééquilibrer via le DCA", "Acheter via le DCA", "Acheter hors DCA", "Vendre"];
const DISCIPLINE = new Set(["Ne rien faire", "Surveiller", "Rééquilibrer via le DCA", "Acheter via le DCA"]);
let moisBilan = null;
function rendreJournal(opts = {}) {
  moisBilan ||= AUJ().slice(0, 7);
  const a = AUJ(), pres = EVENTS.filter((e) => Math.abs(ecartJours(a, dateEvt(e))) <= 45 && e.categorie !== "marche").sort((x, y) => dateEvt(x).localeCompare(dateEvt(y)));
  const evSel = opts.evt || "";
  const ent = [...S.journal].sort((x, y) => y.date.localeCompare(x.date) || y.id.localeCompare(x.id));
  const duMois = S.journal.filter((j) => j.date.slice(0, 7) === moisBilan);
  const parDec = {}; duMois.forEach((j) => { parDec[j.decision] = (parDec[j.decision] || 0) + 1; });
  const disc = duMois.length ? Math.round(duMois.filter((j) => DISCIPLINE.has(j.decision)).length / duMois.length * 100) : null;
  const v = valorisation();
  const fortsDuMois = EVENTS.filter((e) => dateEvt(e).slice(0, 7) === moisBilan && analyse(e, v).niveau === "fort");
  $("#v-journal").innerHTML = `
    <div class="cols"><div>
    <div class="card"><h2>Noter une décision</h2>
      <form id="fj">
        <div class="grid2">
          <label class="champ">Date<input type="date" name="date" value="${a}" required></label>
          <label class="champ">Décision<select name="decision">${DECISIONS.map((d) => `<option>${d}</option>`).join("")}</select></label>
        </div>
        <label class="champ">Événement lié<select name="evt"><option value="">Aucun</option>${pres.map((e) => `<option value="${esc(e.id)}" ${e.id === evSel ? "selected" : ""}>${dateCourte(dateEvt(e))} · ${esc(e.titre)}</option>`).join("")}</select></label>
        <label class="champ">Pourquoi ? (en une ou deux phrases)<textarea name="raison" required placeholder="ex. Fed plus ferme que prévu, mais mon horizon est 2046 : je garde mon versement sur WPEA."></textarea></label>
        <label class="champ">Ton état d'esprit<select name="ressenti"><option>Calme</option><option>Inquiet</option><option>Euphorique</option><option>FOMO</option></select></label>
        <div class="btns"><button class="btn p" type="submit">Enregistrer</button></div>
      </form>
    </div>
    <div class="card"><h2>Bilan mensuel</h2>
      <label class="champ">Mois<input type="month" id="mbilan" value="${moisBilan}"></label>
      ${duMois.length ? `<div class="kpis">
          <div class="kpi"><span class="v">${duMois.length}</span><span class="l">décisions notées</span></div>
          <div class="kpi"><span class="v">${disc} %</span><span class="l">fidèles au plan</span></div>
          <div class="kpi"><span class="v">${fortsDuMois.length}</span><span class="l">événements à impact fort</span></div>
          <div class="kpi"><span class="v">${(parDec["Acheter hors DCA"] || 0) + (parDec["Vendre"] || 0)}</span><span class="l">écarts au plan</span></div></div>
        <table><tbody>${Object.entries(parDec).map(([d, n]) => `<tr><td>${esc(d)}</td><td class="n">${n}</td></tr>`).join("")}</tbody></table>
        <p>${disc >= 90 ? "Discipline exemplaire : c'est exactement ce qui construit 1 M€ en 2046." : disc >= 70 ? "Globalement fidèle au plan. Relis les décisions hors plan : qu'est-ce qui les a déclenchées ?" : "Trop de décisions hors plan ce mois-ci. Le rendement d'un DCA se perd surtout dans ces moments-là."}</p>`
        : `<p class="muted">Aucune décision notée en ${moisLong(moisBilan)}.${fortsDuMois.length ? ` Pourtant ${fortsDuMois.length} événement${fortsDuMois.length > 1 ? "s" : ""} à impact fort : note au moins ta décision de ne rien faire, c'est elle qui compte.` : ""}</p>`}
    </div></div>
    <div><div class="card"><h2>Historique</h2>
      ${ent.length ? ent.map((j) => `<div class="ligne" style="margin-bottom:8px">
        <div class="ligne-h"><b>${esc(j.decision)}</b><span class="small muted">${dateCourte(j.date)}</span></div>
        ${j.titre ? `<div class="small">${esc(j.titre)}</div>` : ""}
        <p style="margin:4px 0">${esc(j.raison)}</p>
        <div class="small muted">État d'esprit : ${esc(j.ressenti || "—")} · <button type="button" class="lien" data-suppr="${esc(j.id)}">supprimer</button></div>
      </div>`).join("") : `<p class="muted">Ton journal est vide.</p>`}
      <div class="btns"><button type="button" class="btn js-copier">Copier mes données</button><button type="button" class="btn js-coller">Coller des données</button><button type="button" class="btn js-exp">Exporter (fichier)</button><label class="btn">Importer un fichier<input type="file" accept="application/json,.json" class="js-imp" hidden></label></div>
      <textarea class="js-zone" hidden aria-label="Données à copier ou coller"></textarea>
    </div></div></div>`;
  $("#fj").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target), evt = fd.get("evt");
    const ev = EVENTS.find((x) => x.id === evt);
    S.journal.push({ id: Date.now().toString(36), date: fd.get("date"), evt: evt || null, titre: ev ? ev.titre : "", decision: fd.get("decision"), raison: fd.get("raison").trim(), ressenti: fd.get("ressenti") });
    sauver(); toast("Décision enregistrée"); rendreJournal();
  });
  $("#mbilan").addEventListener("change", (e) => { if (e.target.value) { moisBilan = e.target.value; rendreJournal(); } });
  $$("[data-suppr]").forEach((b) => b.addEventListener("click", async (e) => { e.stopPropagation(); if (await confirmer("Supprimer cette entrée du journal ?", "Supprimer")) { S.journal = S.journal.filter((j) => j.id !== b.dataset.suppr); sauver(); rendreJournal(); } }));
  brancherExportImport($("#v-journal"));
}

async function importerTexte(texte) {
  try {
    const x = JSON.parse(texte);
    if (!valider(x)) throw new Error("format");
    if (!(await confirmer("Remplacer tes données actuelles par celles-ci ?", "Remplacer"))) return;
    const d = DEFAUT(); S = { ...d, ...x, plan: { ...d.plan, ...(x.plan || {}) }, journal: x.journal || [] };
    sauver(); toast("Données importées"); aller(location.hash.slice(1) || "accueil");
  } catch (e) { toast("Données invalides : rien n'a été modifié"); }
}
function brancherExportImport(racine) {
  const cp = $(".js-copier", racine), cl = $(".js-coller", racine);
  if (cp) cp.addEventListener("click", () => {
    const t = JSON.stringify(S);
    const repli = () => { const z = $(".js-zone", racine); z.hidden = false; z.value = t; z.select(); toast("Sélectionné : copie-le avec ton téléphone"); };
    try { navigator.clipboard.writeText(t).then(() => toast("Données copiées : colle-les sur ton autre appareil"), repli); } catch (e) { repli(); }
  });
  if (cl) cl.addEventListener("click", () => {
    const z = $(".js-zone", racine);
    if (z.hidden || !z.value.trim()) { z.hidden = false; z.value = ""; z.placeholder = "Colle ici les données copiées, puis appuie à nouveau sur « Coller des données »"; z.focus(); return; }
    importerTexte(z.value);
  });
  const ex = $(".js-exp", racine), im = $(".js-imp", racine);
  if (ex) ex.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(S, null, 1)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `cap2046-${AUJ()}.json`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  if (im) im.addEventListener("change", async () => {
    const f = im.files[0]; if (!f) return;
    try { await importerTexte(await f.text()); } catch (e) { toast("Fichier invalide : rien n'a été modifié"); }
    im.value = "";
  });
}

/* ═══ 13. Vue Plan, sources, méthode ═════════════════════════════════════════ */
function projection(r, v0, plan = S.plan, sansApres = false) {
  const debut = AUJ().slice(0, 7), fin = `${plan.annee}-12`;
  const mens = Math.pow(1 + r / 100, 1 / 12) - 1;
  let [y, m] = debut.split("-").map(Number), V = v0;
  const pts = [{ ym: debut, V }];
  while (true) {
    m++; if (m > 12) { m = 1; y++; }
    const ym = `${y}-${String(m).padStart(2, "0")}`;
    if (ym > fin) break;
    V = V * (1 + mens) + (sansApres && ym >= plan.reprise ? 0 : versementPour(ym, plan));
    pts.push({ ym, V });
  }
  return pts;
}
function versementNecessaire(r, v0) {
  const plan = S.plan, A = projection(r, v0, plan, true).at(-1).V;
  const mens = Math.pow(1 + r / 100, 1 / 12) - 1, fin = `${plan.annee}-12`;
  let B = 0, [y, m] = plan.reprise.split("-").map(Number);
  while (true) { const ym = `${y}-${String(m).padStart(2, "0")}`; if (ym > fin) break; B += Math.pow(1 + mens, ecartMois(ym, fin)); m++; if (m > 12) { m = 1; y++; } }
  return B > 0 ? Math.max(0, (plan.objectif - A) / B) : null;
}
const ecartMois = (a, b) => { const [y1, m1] = a.split("-").map(Number), [y2, m2] = b.split("-").map(Number); return (y2 - y1) * 12 + (m2 - m1); };

function graphe(series, objectif) {
  const W = 640, H = 260, mg = { l: 56, r: 92, t: 12, b: 26 };
  if (series[0].pts.length < 2) return `<p class="muted">Projection indisponible : l'année de l'objectif doit être postérieure à l'année en cours.</p>`;
  const n = series[0].pts.length, max = Math.max(objectif * 1.1, ...series.flatMap((s) => s.pts.map((p) => p.V)));
  const X = (i) => mg.l + (i / (n - 1)) * (W - mg.l - mg.r), Y = (val) => mg.t + (1 - val / max) * (H - mg.t - mg.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const annees = series[0].pts.map((p, i) => [p.ym, i]).filter(([ym]) => ym.endsWith("-01") && +ym.slice(0, 4) % 5 === 0);
  let lab = series.map((s) => ({ s, y: Y(s.pts.at(-1).V) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < lab.length; i++) if (lab[i].y - lab[i - 1].y < 28) lab[i].y = lab[i - 1].y + 28;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Projection du patrimoine jusqu'en ${S.plan.annee}">
    ${ticks.map((t) => `<line class="axe" x1="${mg.l}" x2="${W - mg.r}" y1="${Y(t)}" y2="${Y(t)}"/><text x="${mg.l - 6}" y="${Y(t) + 4}" text-anchor="end">${nf(0).format(t / 1000)} k€</text>`).join("")}
    ${annees.map(([ym, i]) => `<text x="${X(i)}" y="${H - 6}" text-anchor="middle">${ym.slice(0, 4)}</text>`).join("")}
    <line class="obj" x1="${mg.l}" x2="${W - mg.r}" y1="${Y(objectif)}" y2="${Y(objectif)}"/><text x="${mg.l + 4}" y="${Y(objectif) - 6}">objectif ${nf(0).format(objectif / 1e6 >= 1 ? objectif / 1e6 : objectif / 1e3)} ${objectif >= 1e6 ? "M€" : "k€"}</text>
    ${series.map((s, k) => `<path class="l${k + 1}" d="${s.pts.map((p, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(p.V).toFixed(1)).join("")}"/>`).join("")}
    ${lab.map(({ s, y }) => `<text class="lab" x="${W - mg.r + 6}" y="${y}">${s.nom}</text><text x="${W - mg.r + 6}" y="${y + 13}">${nf(0).format(s.pts.at(-1).V / 1000)} k€</text>`).join("")}
  </svg>`;
}

function rendrePlan() {
  const v = valorisation(), P = S.plan, v0 = v.complet ? v.total : 0;
  const scen = [P.rendement - 2, +P.rendement, P.rendement + 2].map((r) => ({ r, nom: `${r} %/an`, pts: projection(r, v0) }));
  const central = scen[1].pts.at(-1).V, besoin = versementNecessaire(+P.rendement, v0);
  const nonVerifies = EVENTS.filter((e) => !e.verifie && dateEvt(e) >= AUJ());
  const champ = (k, lib, type = "number", extra = "") => `<label class="champ">${lib}<input type="${type}" ${type === "number" ? 'inputmode="decimal" step="any"' : ""} data-p="${k}" value="${esc(P[k])}" ${extra}></label>`;
  $("#v-plan").innerHTML = `
    <div class="card"><h2>Cap 2046 : ${eur(P.objectif)} en ${P.annee}</h2>
      ${v.complet ? "" : `<div class="alerte">Point de départ = 0 € tant que tes cours ne sont pas saisis (onglet Portefeuille).</div>`}
      <div class="kpis">
        <div class="kpi"><span class="v">${eur(v0)}</span><span class="l">Aujourd'hui</span></div>
        <div class="kpi"><span class="v">${eur(central)}</span><span class="l">Projeté fin ${P.annee} à ${P.rendement} %/an</span></div>
        <div class="kpi"><span class="v">${pct(central / P.objectif * 100, 0)}</span><span class="l">de l'objectif</span></div>
        <div class="kpi"><span class="v">${besoin != null ? eur(besoin) : "—"}</span><span class="l">par mois après ${moisLong(P.reprise)} pour l'atteindre</span></div>
      </div>
      <div class="graph">${graphe(scen, +P.objectif)}</div>
      <p class="small muted">Hypothèses de rendement annuel moyen, pas des promesses. Le versement nécessaire suppose ton plan inchangé jusqu'au retour d'Australie.</p>
    </div>
    <div class="card"><h2>Paramètres de ton plan</h2>
      <div class="grid2">
        ${champ("objectif", "Objectif (€)")}${champ("annee", "Année de l'objectif")}
        ${champ("v1", "Versement mensuel actuel (€)")}${champ("v1_jusqu_a", "… jusqu'à (mois inclus)", "month")}
        ${champ("v2", "Versement mensuel ensuite (€)")}${champ("rendement", "Rendement annuel supposé (%)")}
        ${champ("depart", "Départ en Australie (hypothèse à ajuster)", "month")}${champ("v_pendant", "Versement mensuel pendant le séjour (€)")}
        ${champ("reprise", "Reprise des versements", "month")}${champ("v_reprise", "Versement mensuel à la reprise (€)")}
      </div>
      <label class="champ">Plafond par action individuelle (%)<input type="number" inputmode="decimal" step="any" id="plafond" value="${esc(S.plafond_ligne)}"></label>
      <p class="small">Tes règles : pas d'${g("effet de levier")} · pas de pari sur une action isolée sur un coup de tête · pas de produit hors PEA par ${g("FOMO")} · pas de ${g("market timing")}.</p>
    </div>
    <div class="card"><h2>Fraîcheur des données</h2>
      <p class="small">Fichier d'événements généré le ${GENERE ? new Date(GENERE).toLocaleString("fr-FR", { timeZone: TZ }) : "—"} (heure de Paris).</p>
      <div class="tscroll"><table><thead><tr><th>Source automatique</th><th>État</th><th>Dernière lecture réussie</th></tr></thead><tbody>
      ${Object.entries(STATUT).map(([k, s]) => `<tr><td>${esc({ fed: "Fed (FOMC)", bce: "BCE", boe: "Banque d'Angleterre", boj: "Banque du Japon", bea: "BEA (PIB, PCE)", euronext: "Euronext", nyse: "NYSE", tte: "TotalEnergies" }[k] || k)}</td>
        <td>${s.ok ? `<span class="badge b-v">✓ lue</span>` : `<span class="badge b-nv">⚠ échec : ${esc(s.message)}</span>`}</td><td>${s.le ? dateCourte(s.le) : "jamais"}</td></tr>`).join("")}
      </tbody></table></div>
      <h3 style="margin-top:12px">À vérifier à la main (${nonVerifies.length} événements + compositions d'ETF)</h3>
      <ul class="small">${nonVerifies.map((e) => `<li>${dateCourte(dateEvt(e))} · ${esc(e.titre)} — <a href="${esc(e.source_url)}" target="_blank" rel="noopener">source officielle</a></li>`).join("")}
        ${Object.entries(ETF.lignes).filter(([, c]) => !c.verifie).map(([id, c]) => `<li>Composition ${esc(c.nom)} — ${c.factsheet_url ? `<a href="${esc(c.factsheet_url)}" target="_blank" rel="noopener">émetteur</a>` : "adresse de la fiche à trouver"}</li>`).join("")}</ul>
    </div>
    <div class="card"><h2>Comment sont calculés l'impact et le verdict</h2>
      <p class="small"><b>${g("exposition", "Exposition")}</b> = somme, pour chaque ligne, de son ${g("poids")} × la part de la ligne concernée par l'événement (pays pour une banque centrale ou une statistique, entreprise pour des résultats).</p>
      <p class="small"><b>Impact fort</b> : importance forte et ≥ 40 % du portefeuille exposé (ou importance moyenne et ≥ 70 %) ; résultats d'entreprise ≥ 3 % du portefeuille. <b>Moyen</b> : importance forte et ≥ 10 %, importance moyenne et ≥ 20 %, ou résultats ≥ 1 %. Sinon <b>faible</b>. Jours fermés et échéances techniques : toujours faible.</p>
      <p class="small"><b>Verdict</b> : par défaut « Ne rien faire, continue ton DCA ». « Surveiller » si l'impact est fort ou si le texte touche la fiscalité. « Revoir l'allocation » seulement si l'impact est fort ET qu'une ligne s'écarte déjà de plus de 5 points de sa cible (ou dépasse le plafond) ; la correction passe toujours par les versements, jamais par une vente sur l'actualité.</p>
    </div>
    <div class="card"><h2>Glossaire</h2><dl class="small">${Object.entries(GLOSSAIRE).map(([t, d]) => `<dt><b>${esc(t)}</b></dt><dd style="margin:0 0 8px">${esc(d)}</dd>`).join("")}</dl></div>
    <div class="card"><h2>Tes données</h2>
      <p class="small">Portefeuille, plan et journal sont enregistrés uniquement dans ce navigateur${stockageOK ? "" : " — <b>stockage indisponible ici : exporte avant de fermer</b>"}. Exporte régulièrement pour les garder ou les passer sur un autre appareil.</p>
      <div class="btns"><button type="button" class="btn js-copier">Copier mes données</button><button type="button" class="btn js-coller">Coller des données</button><button type="button" class="btn js-exp">Exporter (fichier)</button><label class="btn">Importer un fichier<input type="file" accept="application/json,.json" class="js-imp" hidden></label><button type="button" class="btn" id="raz">Réinitialiser</button></div>
      <textarea class="js-zone" hidden aria-label="Données à copier ou coller"></textarea>
    </div>`;
  $$("#v-plan [data-p]").forEach((inp) => inp.addEventListener("change", () => {
    const k = inp.dataset.p;
    if (inp.type === "month") { if (/^\d{4}-\d{2}$/.test(inp.value)) P[k] = inp.value; else { toast("Mois invalide"); inp.value = P[k]; return; } }
    else { const x = parseFloat(inp.value.replace(",", ".")); if (!isFinite(x) || x < 0 || (k === "annee" && (x < 2027 || x > 2100))) { toast("Valeur invalide"); inp.value = P[k]; return; } P[k] = k === "annee" ? Math.round(x) : x; }
    sauver(); rendrePlan();
  }));
  $("#plafond").addEventListener("change", (e) => { const x = parseFloat(e.target.value.replace(",", ".")); if (isFinite(x) && x > 0 && x <= 100) { S.plafond_ligne = x; sauver(); } rendrePlan(); });
  $("#raz").addEventListener("click", async () => { if (await confirmer("Effacer portefeuille, plan et journal de cet appareil ? Copie ou exporte tes données avant si tu veux les garder.", "Tout effacer")) { S = DEFAUT(); sauver(); rendrePlan(); toast("Réinitialisé"); } });
  brancherExportImport($("#v-plan"));
}

/* ═══ 13 bis. Bourses : horloges, statuts, meilleure fenêtre ═════════════════ */
function heureLocale(date, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", weekday: "short" })
    .formatToParts(date).filter((x) => x.type !== "literal").map((x) => [x.type, x.value]));
  return { iso: `${p.year}-${p.month}-${p.day}`, h: +p.hour, mi: +p.minute, s: +p.second, wd: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday) };
}
// Heure locale « AAAA-MM-JJ HH:MM » d'un fuseau → instant UTC (changements d'heure gérés).
function versUTC(iso, hhmm, tz) {
  const [y, m, d] = iso.split("-").map(Number), [h, mi] = hhmm.split(":").map(Number);
  let t = Date.UTC(y, m - 1, d, h, mi);
  for (let k = 0; k < 2; k++) {
    const l = heureLocale(new Date(t), tz), [ly, lm, ld] = l.iso.split("-").map(Number);
    t -= Date.UTC(ly, lm - 1, ld, l.h, l.mi) - Date.UTC(y, m - 1, d, h, mi);
  }
  return new Date(t);
}
const hm = (d, tz) => new Intl.DateTimeFormat("fr-FR", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(d);
const duree = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`; };

function particularite(b, iso) {
  // Jours fériés et séances réduites connus (Paris et New York, sources officielles du calendrier).
  if (b.id.startsWith("paris")) {
    const e = EVENTS.find((x) => x.id === "euronext-" + iso);
    if (e) return /demi/.test(e.titre) ? { fin: "14:05", note: "demi-séance (clôture 14:05)" } : { ferme: true, note: e.titre.replace("Euronext Paris fermé", "férié").trim() };
  }
  if (b.id === "newyork") {
    if (EVENTS.find((x) => x.id === "nyse-" + iso)) return { ferme: true, note: "férié aux États-Unis" };
    if (EVENTS.find((x) => x.id === "nyse-early-" + iso)) return { fin: "13:00", note: "clôture anticipée à 13:00" };
  }
  return null;
}
function seancesDuJour(b, iso) {
  const wd = new Date(iso + "T12:00:00Z").getUTCDay();
  if (wd === 0 || wd === 6) return { ferme: true, note: "week-end", seances: [] };
  const p = particularite(b, iso);
  if (p && p.ferme) return { ferme: true, note: p.note, seances: [] };
  const seances = b.sessions.map(([a, z], i) => [a, i === b.sessions.length - 1 && p && p.fin ? p.fin : z])
    .filter(([a, z]) => a < z).map(([a, z]) => ({ debut: versUTC(iso, a, b.tz), fin: versUTC(iso, z, b.tz) }));
  return { ferme: false, note: p ? p.note : "", seances };
}
function statutBourse(b, now) {
  const loc = heureLocale(now, b.tz), j = seancesDuJour(b, loc.iso);
  for (const s of j.seances) if (now >= s.debut && now < s.fin) return { etat: "ouvert", libelle: "Ouvert", change: s.fin, verbe: "ferme dans", jour: j };
  const ensuite = j.seances.find((s) => now < s.debut);
  if (ensuite) {
    const pause = j.seances.some((s) => now >= s.fin);
    return { etat: pause ? "pause" : "attente", libelle: pause ? "Pause déjeuner" : (b.pre && hm(now, b.tz) >= b.pre ? "Pré-ouverture" : "Fermé"), change: ensuite.debut, verbe: "ouvre dans", jour: j };
  }
  for (let k = 1; k <= 10; k++) {  // prochaine ouverture
    const iso = ajoutJours(loc.iso, k), jj = seancesDuJour(b, iso);
    if (jj.seances.length) return { etat: j.ferme && j.note !== "week-end" ? "ferie" : "ferme", libelle: j.ferme ? (j.note === "week-end" ? "Fermé (week-end)" : "Fermé (" + j.note + ")") : "Fermé", change: jj.seances[0].debut, verbe: "ouvre dans", jour: j };
  }
  return { etat: "ferme", libelle: "Fermé", change: null, verbe: "", jour: j };
}

function fenetre(idLigne, isoParis) {
  const cfg = BOURSES.lignes_fenetres[idLigne] || { type: "europe", explication: "" };
  const paris = BOURSES.bourses.find((b) => b.id === (cfg.type === "action" ? "paris-actions" : "paris-etf"));
  if (!paris) return null;
  const j = seancesDuJour(paris, isoParis);
  if (!j.seances.length) return { ferme: true, note: j.note, cfg };
  const s = j.seances[0];
  let debut = new Date(+s.debut + 15 * 60000), fin = new Date(+s.fin - 5 * 60000), note = j.note ? `Paris : ${j.note}. ` : "", ok = true;
  const croiser = (id, marge) => {
    const b = BOURSES.bourses.find((x) => x.id === id); if (!b) return false;
    const jj = seancesDuJour(b, heureLocale(s.debut, b.tz).iso);
    const sb = jj.seances.find((x) => x.fin > debut && x.debut < fin);
    if (!sb) { note += `${b.nom} fermé ce jour-là (${jj.note || "hors séance"}) : fourchettes plus larges. `; return false; }
    debut = new Date(Math.max(+debut, +sb.debut + marge * 60000)); fin = new Date(Math.min(+fin, +sb.fin));
    if (!b.verifie) note += `Horaires de ${b.nom} non vérifiés. `;
    return true;
  };
  if (cfg.type === "us") ok = croiser("newyork", 10);
  if (cfg.type === "em") ok = croiser("mumbai", 15);
  if (debut >= fin) { debut = new Date(+s.debut + 15 * 60000); fin = new Date(+s.fin - 5 * 60000); ok = false; }
  return { debut, fin, note, cfg, ideal: ok };
}

const TZ_VUE = () => { try { return localStorage.getItem("cap2046.tz") || TZ; } catch (e) { return TZ; } };
let minuteurBourses = null;
function rendreBourses() {
  const tzv = TZ_VUE(), now = new Date(), isoP = isoParis(now), v = valorisation();
  const sug = suggestionDCA(versementPour(isoP.slice(0, 7)));
  const ligneDef = (() => { try { return localStorage.getItem("cap2046.ligneOrdre"); } catch (e) { return null; } })() || (sug ? sug.ligne.id : "WPEA");
  const tri = [...BOURSES.bourses].sort((a, b) => a.ordre - b.ordre);
  const nomTz = { "Europe/Paris": "Paris", "Australia/Sydney": "Sydney" }[tzv] || "ton appareil";
  // Ligne du temps : la journée affichée dans le fuseau choisi
  const jourV = heureLocale(now, tzv).iso, d0 = versUTC(jourV, "00:00", tzv), d1 = versUTC(ajoutJours(jourV, 1), "00:00", tzv), L = d1 - d0;
  const pctT = (t) => Math.max(0, Math.min(100, ((t - d0) / L) * 100));
  const barres = (b) => {
    const out = [];
    for (const k of [-1, 0, 1]) {
      const isoB = ajoutJours(heureLocale(now, b.tz).iso, k);
      for (const s of seancesDuJour(b, isoB).seances) if (s.fin > d0 && s.debut < d1) out.push(`<span class="tl-s" style="left:${pctT(s.debut)}%;width:${pctT(s.fin) - pctT(s.debut)}%" title="${esc(hm(s.debut, tzv))}–${esc(hm(s.fin, tzv))}"></span>`);
    }
    return out.join("");
  };
  const fen = fenetre(ligneDef, isoP);
  const lignes = S.positions.filter((p) => BOURSES.lignes_fenetres[p.id]);
  $("#v-bourses").innerHTML = `
    <div class="card horloge">
      <div><span class="small muted">Heure de Paris</span><span class="h-gros num" data-horloge="${TZ}">${hm(now, TZ)}</span></div>
      <div><label class="small muted">Afficher les horaires en heure de
        <select id="tz-vue"><option value="Europe/Paris">Paris</option><option value="Australia/Sydney">Sydney (Australie)</option><option value="${esc(Intl.DateTimeFormat().resolvedOptions().timeZone)}">mon appareil (${esc(Intl.DateTimeFormat().resolvedOptions().timeZone)})</option></select></label>
        ${tzv !== TZ ? `<span class="h-moyen num" data-horloge="${esc(tzv)}">${hm(now, tzv)}</span>` : ""}</div>
    </div>

    <div class="card dca" id="ordre"></div>

    <div class="card"><h2>Les bourses sur 24 heures <span class="small muted">(heure de ${esc(nomTz)})</span></h2>
      <div class="tl">${tri.map((b) => `<div class="tl-r"><span class="tl-n">${esc(b.nom)}</span><span class="tl-b">${barres(b)}<i class="tl-now" style="left:${pctT(now)}%"></i></span></div>`).join("")}
        <div class="tl-r"><span class="tl-n"></span><span class="tl-ax">${[0, 6, 12, 18, 24].map((h) => `<span style="left:${h / 24 * 100}%">${String(h % 24).padStart(2, "0")}h</span>`).join("")}</span></div>
      </div>
      <p class="small muted">Barres = séances de cotation continue. Trait vertical = maintenant. Les jours fériés sont connus pour Paris et New York (sources officielles), pas pour les autres places.</p>
    </div>

    <div class="bourses">${tri.map((b) => `<div class="card bourse" data-b="${esc(b.id)}"></div>`).join("")}</div>

    <div class="card"><h2>Prochaines fermetures (Paris et New York)</h2>
      ${(() => { const f = EVENTS.filter((e) => /^(euronext|nyse)/.test(e.id) && e.date >= isoP).slice(0, 8);
        return f.length ? `<ul class="small">${f.map((e) => `<li>${dateCourte(e.date)} · ${esc(e.titre)}</li>`).join("")}</ul>` : `<p class="muted">Aucune connue.</p>`; })()}
    </div>`;
  $("#tz-vue").value = tzv;
  $("#tz-vue").addEventListener("change", (e) => { try { localStorage.setItem("cap2046.tz", e.target.value); } catch (x) {} rendreBourses(); });
  const majOrdre = () => {
    const t = new Date(), f = fenetre(ligneDef, isoParis(t)), l = S.positions.find((p) => p.id === ligneDef);
    let etat;
    if (!f || f.ferme) {
      const dem = [1, 2, 3, 4, 5, 6, 7].map((k) => fenetre(ligneDef, ajoutJours(isoParis(t), k))).find((x) => x && !x.ferme);
      etat = `<div class="verdict v-surv"><strong>Bourse de Paris fermée aujourd'hui${f && f.note ? " (" + esc(f.note) + ")" : ""}.</strong>${dem ? `Prochaine fenêtre : ${dateCourte(isoParis(dem.debut))}, ${hm(dem.debut, tzv)}–${hm(dem.fin, tzv)} (heure de ${esc(nomTz)}).` : ""}</div>`;
    } else if (t < f.debut) etat = `<div class="verdict v-surv"><strong>Attends ${hm(f.debut, tzv)} (dans ${duree(f.debut - t)}).</strong>Fenêtre conseillée aujourd'hui : ${hm(f.debut, tzv)}–${hm(f.fin, tzv)} (heure de ${esc(nomTz)}).</div>`;
    else if (t < f.fin) etat = `<div class="verdict v-rien"><strong>✓ Bon moment pour passer ton ordre${f.ideal ? "" : " (fenêtre de repli)"}.</strong>Fenêtre ouverte jusqu'à ${hm(f.fin, tzv)} (encore ${duree(f.fin - t)}).</div>`;
    else { const dem = [1, 2, 3, 4, 5, 6, 7].map((k) => fenetre(ligneDef, ajoutJours(isoParis(t), k))).find((x) => x && !x.ferme);
      etat = `<div class="verdict v-surv"><strong>Fenêtre passée pour aujourd'hui.</strong>${dem ? `Prochaine : ${dateCourte(isoParis(dem.debut))}, ${hm(dem.debut, tzv)}–${hm(dem.fin, tzv)}.` : ""}</div>`; }
    $("#ordre").innerHTML = `<h2>Quand passer ton ordre ?</h2>
      <label class="champ">Ligne<select id="ligne-ordre">${lignes.map((p) => `<option value="${esc(p.id)}" ${p.id === ligneDef ? "selected" : ""}>${esc(p.nom)}${sug && sug.ligne.id === p.id ? " — prochain versement" : ""}</option>`).join("")}</select></label>
      ${etat}
      ${f && f.cfg ? `<p class="small">${esc(f.cfg.explication)}</p>` : ""}${f && f.note ? `<p class="small muted">${esc(f.note)}</p>` : ""}
      <p class="small"><b>La règle :</b> pas pendant le ${g("fixing")} d'ouverture ni dans le premier quart d'heure, pas dans les dernières minutes. Toujours un ${g("ordre à cours limité")}, légèrement au-dessus du prix de vente affiché. Tu réduis la ${g("fourchette")} payée ; tu ne cherches pas à deviner la direction du marché.</p>
      <p class="small muted">C'est de la qualité d'exécution, pas du market timing : sur un versement de 726 €, l'écart en jeu est de quelques euros. Le jour du versement compte infiniment moins que la régularité.</p>`;
    $("#ligne-ordre").addEventListener("change", (e) => { try { localStorage.setItem("cap2046.ligneOrdre", e.target.value); } catch (x) {} rendreBourses(); });
  };
  const majCartes = () => {
    const t = new Date();
    for (const b of tri) {
      const c = $(`.bourse[data-b="${b.id}"]`), st = statutBourse(b, t);
      if (!c) continue;
      const j = seancesDuJour(b, heureLocale(t, b.tz).iso);
      c.className = "card bourse st-" + st.etat;
      c.innerHTML = `<div class="b-h"><b>${esc(b.nom)}</b><span class="badge b-${st.etat === "ouvert" ? "v" : st.etat === "pause" || st.etat === "attente" ? "cat" : "faible"}">${st.etat === "ouvert" ? "● " : ""}${esc(st.libelle)}</span></div>
        <div class="num"><span class="h-moyen">${hm(t, b.tz)}</span> <span class="small muted">heure locale</span></div>
        ${st.change ? `<div class="small"><b>${esc(st.verbe)} ${duree(st.change - t)}</b> (${hm(st.change, tzv)} heure de ${esc(nomTz)})</div>` : ""}
        <div class="small muted">Séance : ${b.sessions.map(([a, z]) => `${a}–${z}`).join(" · ")} locale${j.seances.length ? ` = ${j.seances.map((s) => `${hm(s.debut, tzv)}–${hm(s.fin, tzv)}`).join(" · ")} (${esc(nomTz)})` : ""}${j.note && j.note !== "week-end" ? ` · <b>${esc(j.note)}</b>` : ""}</div>
        <div class="small">${esc(b.note)}</div>
        <div class="small">${b.verifie ? `<span class="badge b-v">✓ vérifié le ${dateCourte(b.verifie_le)}</span>` : `<span class="badge b-nv">⚠ non vérifié</span> <span class="muted">${esc(b.note_verification || "")}</span>`} <a href="${esc(b.source_url)}" target="_blank" rel="noopener">source</a></div>`;
    }
    $$("[data-horloge]").forEach((el) => { el.textContent = new Intl.DateTimeFormat("fr-FR", { timeZone: el.dataset.horloge, hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(t); });
  };
  majOrdre(); majCartes();
  clearInterval(minuteurBourses);
  let n = 0;
  minuteurBourses = setInterval(() => {
    if ($("#v-bourses").hidden) { clearInterval(minuteurBourses); return; }
    $$("[data-horloge]").forEach((el) => { el.textContent = new Intl.DateTimeFormat("fr-FR", { timeZone: el.dataset.horloge, hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date()); });
    if (++n % 30 === 0) { majCartes(); majOrdre(); }
  }, 1000);
}

/* ═══ 13 ter. Visite guidée (premier lancement, puis bouton « ? ») ══════════════ */
const GUIDE = [
  ["◎", "Bienvenue dans Cap 2046", "Ton copilote PEA. Il surveille les événements qui font bouger les marchés et te dit, pour chacun, ce que ça change pour <b>ton</b> portefeuille. Sa réponse par défaut : <b>ne rien faire, continuer ton DCA</b>."],
  ["◔", "Étape 1 : saisis tes cours", "Onglet <b>Positions</b> : recopie le cours de tes 5 lignes depuis l'appli Fortuneo (2 minutes). Le site calcule tes poids réels, tes écarts avec tes cibles et la ligne à renforcer avec ton prochain versement."],
  ["▦", "Étape 2 : l'agenda", "Onglet <b>Agenda</b> : Fed, BCE, inflation, résultats… Chaque événement a sa fiche : pourquoi ça bouge, tes lignes exposées, un verdict en 2 phrases et la source officielle. « ⚠ non vérifié » = à confirmer."],
  ["◷", "Étape 3 : les bourses", "Onglet <b>Bourses</b> : qui est ouvert maintenant, à Paris, New York ou Tokyo, et le meilleur moment pour passer ton ordre (moins de frais cachés). Fonctionne aussi à l'heure de Sydney."],
  ["✋", "Quand tu as envie de réagir", "Onglet <b>Anti-FOMO</b> : 9 questions, un verdict. C'est ton garde-fou contre les achats sur un coup de tête. Note ensuite ta décision dans le <b>Journal</b> : le bilan mensuel mesure ta discipline."],
  ["⚑", "Pour apprendre chaque jour", "Le <b>mot du jour</b> sur l'accueil, et la <b>veille IA</b> (lien en haut) : décryptages d'actualité, un cours chaque lundi, simulateur, lexique. Ajoute Cap 2046 à l'écran d'accueil de ton téléphone : il s'ouvre comme une appli."],
];
function ouvrirGuide() {
  let i = 0;
  const fond = document.createElement("div");
  fond.className = "guide-fond";
  fond.innerHTML = `<div class="guide" role="dialog" aria-modal="true" aria-labelledby="guide-t"></div>`;
  document.body.appendChild(fond);
  const boite = $(".guide", fond);
  const clavier = (e) => { if (e.key === "Escape") fermer(); };
  const fermer = () => { fond.parentNode && fond.parentNode.removeChild(fond); try { localStorage.setItem("cap2046.guide", "vu"); } catch (e) {} document.removeEventListener("keydown", clavier); };
  const dessiner = () => {
    const [ic, t, txt] = GUIDE[i];
    boite.innerHTML = `<div class="guide-ic" aria-hidden="true">${ic}</div><h2 id="guide-t">${t}</h2><p>${txt}</p>
      <div class="guide-pts">${GUIDE.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("")}</div>
      <div class="btns"><button type="button" class="btn" data-g-a="passer">${i === GUIDE.length - 1 ? "Fermer" : "Passer"}</button>
      ${i > 0 ? `<button type="button" class="btn" data-g-a="prec">Précédent</button>` : ""}
      <button type="button" class="btn p" data-g-a="suiv">${i === GUIDE.length - 1 ? "C'est parti" : "Suivant"}</button></div>`;
    $("[data-g-a=suiv]", boite).focus();
  };
  boite.addEventListener("click", (e) => {
    const a = e.target.closest("[data-g-a]"); if (!a) return;
    if (a.dataset.gA === "suiv") { if (i < GUIDE.length - 1) { i++; dessiner(); } else { fermer(); if (!valorisation().complet) aller("portefeuille"); } }
    else if (a.dataset.gA === "prec") { i--; dessiner(); }
    else fermer();
  });
  fond.addEventListener("click", (e) => { if (e.target === fond) fermer(); });
  document.addEventListener("keydown", clavier);
  dessiner();
}
$("#aide").addEventListener("click", ouvrirGuide);

/* ═══ 14. Démarrage ══════════════════════════════════════════════════════════ */
const RENDU = { accueil: rendreAccueil, calendrier: rendreCalendrier, bourses: rendreBourses, portefeuille: rendrePortefeuille, fomo: rendreFomo, journal: rendreJournal, plan: rendrePlan };

function majEntete() {
  const vieux = GENERE && (Date.now() - new Date(GENERE)) / 864e5 > 8;
  $("#maj").innerHTML = (GENERE ? `Événements mis à jour le ${new Date(GENERE).toLocaleDateString("fr-FR", { timeZone: TZ })}${vieux ? ` <span class="badge b-nv">⚠ plus de 8 jours</span>` : ""}` : "")
    + (VEILLE_DISPO ? `<br><a href="/veille/">Veille IA, cours et simulateur →</a>` : "");
}

async function demarrer() {
  S = charger();
  try {
    // Version vivante (relayée par Netlify, mise à jour chaque matin) ; à défaut, la copie livrée avec le site.
    const json = (u) => fetch(u, { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error(u + " " + r.status); return r.json(); });
    const evLive = () => json("data/events-live.json").then((d) => { if (!Array.isArray(d.events)) throw new Error("format"); SOURCE_EV = "live"; return d; });
    const enLigne = VEILLE_DISPO;  // le relais du calendrier n'existe que sur le site Netlify
    const [ev, etf] = await Promise.all([
      (enLigne ? evLive() : Promise.reject(new Error("local"))).catch(() => { SOURCE_EV = "copie"; return json("data/events.json"); }),
      fetch("data/etf.json", { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error("etf " + r.status); return r.json(); }),
    ]);
    EVENTS = (ev.events || []).filter((e) => e && e.id && /^\d{4}-\d{2}-\d{2}$/.test(e.date));
    A_CONFIRMER = ev.a_confirmer || []; STATUT = ev.sources_statut || {}; GENERE = ev.genere_le || null; ETF = etf;
    try { BOURSES = await json("data/bourses.json"); } catch (e) { /* onglet Bourses indisponible, le reste fonctionne */ }
  } catch (e) {
    $("main").insertAdjacentHTML("afterbegin", `<div class="alerte fort">Impossible de charger les données (${esc(e.message)}). Si tu as ouvert le fichier directement depuis ton ordinateur, passe par Netlify ou un petit serveur local : les navigateurs bloquent la lecture des fichiers JSON en « file:// ».</div>`);
  }
  majEntete();
  aller(location.hash.slice(1) || "accueil");
  let vu = null; try { vu = localStorage.getItem("cap2046.guide"); } catch (e) {}
  if (!vu && !navigator.webdriver) ouvrirGuide();
}
demarrer();
