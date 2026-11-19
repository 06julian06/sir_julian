"""Orchestrateur. Trois modes, déclenchés par GitHub Actions :

  python -m veille.main radar      toutes les 3 h : scan des flux, tri IA, alerte si événement majeur
  python -m veille.main quotidien  chaque matin  : édition complète + newsletter
  python -m veille.main hebdo      le dimanche   : bilan de la semaine + newsletter
  python -m veille.main build      reconstruit le site seul (aucun appel IA)

Option --demo : génère une édition factice sans clé API, pour tester le rendu.
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import yaml

from . import collect, render
from .render import DATA, PARIS, ROOT

log = logging.getLogger("veille")
CONFIG = ROOT / "config"
SITE_URL = os.environ.get("SITE_URL", "").rstrip("/") + "/" if os.environ.get("SITE_URL") else ""


def _yaml(name: str) -> dict:
    return yaml.safe_load((CONFIG / name).read_text())


def _json_load(p: Path, default):
    return json.loads(p.read_text()) if p.exists() else default


def _json_save(p: Path, obj) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False, indent=1))


def _portefeuille_conf() -> dict:
    """Le secret PORTEFEUILLE_YAML (privé) est prioritaire sur le fichier versionné."""
    raw = os.environ.get("PORTEFEUILLE_YAML")
    if raw:
        return yaml.safe_load(raw) or {}
    p = CONFIG / "portefeuille.yml"
    return (yaml.safe_load(p.read_text()) or {}) if p.exists() else {}


MONTANTS = ("valeur_eur", "pv_eur", "total_eur", "liquidites_eur", "var_jour_eur", "cours")


def _pf_public(pf: dict | None) -> dict | None:
    """Version publiable : sans montants en euros (les données du dossier data/ sont versionnées
    dans le dépôt et publiées sur le site), sauf si le profil l'autorise explicitement."""
    if not pf or pf.get("afficher_montants_sur_site"):
        return pf
    out = {k: v for k, v in pf.items() if k not in MONTANTS}
    out["lignes"] = [{k: v for k, v in l.items() if k not in MONTANTS} for l in pf["lignes"]]
    out["alertes_regles"] = pf["alertes_regles"]
    return out


def _deja_traites(n: int = 30) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {"deep_dive": [], "notion": []}
    for e in render.load_editions()[:n]:
        for r in e.get("rubriques", []):
            if r["id"] in out:
                out[r["id"]] += [it["titre"] for it in r["items"]]
    return out


def _contexte(items: list[dict], marches: list[dict], radar: list[dict], mode: str,
              pf: dict | None = None, questions: list[dict] | None = None) -> str:
    today = datetime.now(PARIS)
    lignes_m = "\n".join(
        f"- {m['nom']} : {m['cloture']} ({m['var_jour_pct']:+.2f} % sur la séance, {m['var_1an_pct']:+.1f} % sur 1 an) au {m['date']}"
        for m in marches if not m.get("indisponible")) or "(cotations indisponibles)"
    lignes_a = "\n".join(f"- [{i['source']}] {i['titre']} — {i['url']}\n  {i['resume'][:300]}" for i in items[:80])
    lignes_r = "\n".join(f"- (imp. {r['importance']}) {r['titre']} — {r['url']}" for r in radar[:20])
    hist = ""
    if mode == "hebdo":
        eds = render.load_editions()[:7]
        hist = "\n\nÉDITIONS DE LA SEMAINE (titres + essentiel) :\n" + "\n".join(
            f"- {e['date']} : {e['titre_edition']} | " + " / ".join(e.get("essentiel", [])) for e in eds)
    if pf:
        lignes_pf = "\n".join(
            f"- {l['nom']} ({l.get('type')}, {l.get('enveloppe')}) : indisponible" if l.get("indisponible") else
            f"- {l['nom']} ({l.get('type')}, {l.get('enveloppe')}) : {l['valeur_eur']} € · poids {l['poids_pct']} % · "
            f"perf {l['perf_pct']:+.2f} % depuis PRU · jour {l['var_jour_pct']:+.2f} %" for l in pf["lignes"])
        bloc_pf = (f"Total {pf['total_eur']} € (dont liquidités {pf['liquidites_eur']} €) · plus-value latente "
                   f"{pf['pv_eur']:+} € ({pf['perf_pct']:+.2f} %) · variation du jour {pf['var_jour_eur']:+} € "
                   f"({pf['var_jour_pct']:+.2f} %)\n{lignes_pf}\nRÈGLES VIOLÉES : "
                   + ("; ".join(pf["alertes_regles"]) or "aucune"))
    else:
        bloc_pf = "(aucun portefeuille configuré — explique comment le configurer dans config/portefeuille.yml ou le secret PORTEFEUILLE_YAML)"
    bloc_q = "\n".join(f"- [#{q['numero']}] {q['titre']}\n  {q['texte']}" for q in (questions or [])) or "(aucune question reçue)"
    deja = _deja_traites()
    return f"""DATE : {today.strftime('%A %d %B %Y, %Hh%M')} (heure de Paris)

PORTEFEUILLE (données réelles calculées, ne pas modifier les chiffres ; dans tes textes,
exprime-toi en %, poids et performances — jamais en montants en euros, car le site est public) :
{bloc_pf}

QUESTIONS REÇUES :
{bloc_q}

DÉJÀ TRAITÉS RÉCEMMENT (ne pas répéter) :
- Deep Dives : {", ".join(deja["deep_dive"]) or "aucun"}
- Notions : {", ".join(deja["notion"]) or "aucune"}

COTATIONS (données réelles, ne pas modifier les chiffres) :
{lignes_m}

COLLECTE RSS ({len(items)} articles récents) :
{lignes_a}

SIGNAUX DU FIL CONTINU (déjà triés) :
{lignes_r or '(aucun)'}{hist}"""


def _valider_sources(ed: dict, urls_ok: set[str]) -> int:
    """Garde-fou anti-hallucination : toute URL non vue pendant la collecte ou la recherche est retirée."""
    retirees = 0
    for r in ed["rubriques"]:
        for it in r["items"]:
            it["importance"] = max(1, min(5, int(it.get("importance", 3))))
            if it["source_url"] and it["source_url"] not in urls_ok:
                log.warning("URL non vérifiée retirée : %s", it["source_url"])
                it["source_url"] = ""
                it["source_nom"] = (it["source_nom"] + " (lien non vérifié)").strip() if it["source_nom"] else ""
                retirees += 1
    ed["alerte"]["niveau"] = max(1, min(5, int(ed["alerte"]["niveau"])))
    return retirees


def _texte_brut(ed: dict) -> str:
    out = [ed["titre_edition"], ed["accroche"], "", "L'ESSENTIEL"] + [f"- {p}" for p in ed["essentiel"]]
    for r in ed["rubriques"]:
        out += ["", r["titre"].upper()]
        for it in r["items"]:
            out += [f"* {it['titre']}", it["texte"], f"  Pour toi : {it['pourquoi']}" if it["pourquoi"] else "",
                    f"  Source : {it['source_url']}" if it["source_url"] else ""]
    out += ["", "LE MOT DU MENTOR", ed["mot_du_mentor"]]
    return "\n".join(x for x in out if x is not None)


# ─── Modes ────────────────────────────────────────────────────────────────────

def run_edition(mode: str, demo: bool = False) -> None:
    sources = _yaml("sources.yml")
    items = collect.fetch_feeds(sources["flux"], max_age_hours=36 if mode == "quotidien" else 168)
    marches = collect.fetch_markets(sources["marches"])
    radar = _json_load(DATA / "radar.json", [])
    pf = collect.fetch_portfolio(_portefeuille_conf())
    from . import github_questions
    questions = [] if demo else github_questions.fetch_open()

    if demo:
        ed = _demo_edition()
        urls = {i["url"] for i in items}
    else:
        from . import brain
        system = brain.system_prompt(_yaml("profil.yml"), _yaml("structure.yml"))
        contexte = _contexte(items, marches, radar, mode, pf, questions)
        notes, urls = brain.research(system, contexte, mode)
        urls |= {i["url"] for i in items} | {r["url"] for r in radar}
        ed = brain.write_edition(system, contexte, notes, mode)
        n = _valider_sources(ed, urls)
        g = ed.get("graph_deep_dive") or {}
        if g.get("annees") and g.get("source_url") not in urls:
            log.warning("Chiffres du Deep Dive non sourcés : graphique retiré")
            g["annees"] = []
        log.info("Édition rédigée (%d lien(s) non vérifié(s) retiré(s))", n)

    now = datetime.now(PARIS)
    g = ed.get("graph_deep_dive") or {}
    if g.get("symbole_stooq"):
        g["cours"] = collect.price_series(g["symbole_stooq"])
    ed.update(date=now.date().isoformat(), mode=mode, genere_le=now.isoformat(), marches=marches,
              portefeuille=_pf_public(pf))
    slug = f"{ed['date']}-{mode}"
    _json_save(DATA / "editions" / f"{slug}.json", ed)

    render.build_site(SITE_URL)
    ed_full = next(e for e in render.load_editions() if e["slug"] == slug)
    ed_full["portefeuille"] = pf  # la newsletter (privée) reçoit les montants complets

    # Réponses aux questions : commentaire sur l'issue puis fermeture.
    nums = {q["numero"] for q in questions}
    for r in ed["rubriques"]:
        for it in r["items"]:
            ref = (it.get("ref") or "").lstrip("#")
            if ref in nums:
                github_questions.answer_and_close(ref, f"**{it['titre']}**\n\n{it['texte']}",
                                                  f"{SITE_URL}{ed_full['href']}" if SITE_URL else "")
                nums.discard(ref)
    prefixe = "[Hebdo] " if mode == "hebdo" else ""
    if os.environ.get("NEWSLETTER_DISABLED") != "1":
        from . import newsletter
        newsletter.send(f"{prefixe}{ed['titre_edition']}", render.render_email(ed_full, SITE_URL), _texte_brut(ed))


def run_radar() -> None:
    from . import brain
    sources = _yaml("sources.yml")
    seen_p = DATA / "seen.json"
    seen: dict[str, str] = _json_load(seen_p, {})
    items = collect.fetch_feeds(sources["flux"], max_age_hours=12)
    nouveaux = [i for i in items if i["id"] not in seen][:60]
    log.info("%d nouveaux articles à trier", len(nouveaux))

    retenus = []
    if nouveaux:
        system = brain.system_prompt(_yaml("profil.yml"), _yaml("structure.yml"))
        retenus = brain.triage(system, nouveaux)
    now = datetime.now(timezone.utc)
    for i in nouveaux:
        seen[i["id"]] = now.isoformat()
    # On oublie les identifiants de plus de 7 jours pour garder le fichier léger.
    limite = (now - timedelta(days=7)).isoformat()
    seen = {k: v for k, v in seen.items() if v >= limite}
    _json_save(seen_p, seen)

    radar = _json_load(DATA / "radar.json", [])
    for r in retenus:
        r["detecte_le"] = now.isoformat()
    radar = sorted(retenus + radar, key=lambda r: r["detecte_le"], reverse=True)[:200]
    _json_save(DATA / "radar.json", radar)
    log.info("%d signaux retenus", len(retenus))

    # Alerte immédiate : seulement l'importance 5, et au plus une alerte toutes les 6 h.
    flashs = [r for r in retenus if r["importance"] >= 5]
    state_p = DATA / "state.json"
    state = _json_load(state_p, {})
    dernier = state.get("dernier_flash", "1970-01-01T00:00:00+00:00")
    if flashs and os.environ.get("NEWSLETTER_DISABLED") != "1" and \
            now - datetime.fromisoformat(dernier) > timedelta(hours=6):
        from . import newsletter
        if newsletter.send(f"⚠ Alerte veille : {flashs[0]['titre'][:80]}", render.render_flash(flashs),
                           "\n\n".join(f"{f['titre']}\n{f['pourquoi']}\n{f['url']}" for f in flashs)):
            state["dernier_flash"] = now.isoformat()
            _json_save(state_p, state)

    render.build_site(SITE_URL)


def _demo_edition() -> dict:
    structure = _yaml("structure.yml")["rubriques"]
    return {
        "titre_edition": "Édition de démonstration — le rendu sans IA",
        "accroche": "Cette édition factice sert à vérifier la mise en page. Les vraies éditions sont rédigées par l'IA.",
        "alerte": {"niveau": 2, "message": "Mode démo : aucun appel à l'IA n'a été effectué."},
        "essentiel": ["Le pipeline collecte, rédige et publie sans intervention.",
                      "Les **cotations** du tableau de bord sont réelles quand le réseau le permet.",
                      "Remplis `config/profil.yml` pour une veille vraiment personnalisée."],
        "rubriques": [{"id": r["id"], "titre": r["titre"], "items": [{
            "titre": f"Exemple — {r['titre'].split('—')[0].strip()}",
            "texte": "Texte d'exemple. " + r["consigne"][:220] + "…",
            "pourquoi": "Ici l'IA explique l'impact concret pour ton profil.",
            "source_nom": "", "source_url": "", "importance": 3, "ref": ""}]} for r in structure],
        "agenda": [{"date": datetime.now(PARIS).date().isoformat(), "evenement": "Exemple d'événement",
                    "pourquoi": "Pourquoi le surveiller."}],
        "graph_deep_dive": {"entreprise": "Exemple SA", "symbole_stooq": "", "unite": "Md€", "source_nom": "démo", "source_url": "",
                            "annees": [{"annee": str(2021 + i), "chiffre_affaires": 100 + 12 * i, "free_cash_flow": 8 + 3 * i - (6 if i == 1 else 0)} for i in range(5)]},
        "mot_du_mentor": "Un système qui tourne sans toi ne vaut que par la qualité de ce que tu lui as appris sur toi. Remplis ton profil.",
    }


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    p = argparse.ArgumentParser()
    p.add_argument("mode", choices=["radar", "quotidien", "hebdo", "build"])
    p.add_argument("--demo", action="store_true")
    a = p.parse_args()
    if a.mode == "build":
        render.build_site(SITE_URL)
    elif a.mode == "radar":
        run_radar()
    else:
        run_edition(a.mode, demo=a.demo)


if __name__ == "__main__":
    sys.exit(main())
