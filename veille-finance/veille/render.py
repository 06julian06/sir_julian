"""Transforme les données JSON en site statique et en e-mail HTML."""
from __future__ import annotations

import json
import os
import re
import shutil
from datetime import datetime
from email.utils import format_datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from jinja2 import Environment, FileSystemLoader, select_autoescape
from markupsafe import Markup, escape

PARIS = ZoneInfo("Europe/Paris")
ROOT = Path(__file__).resolve().parent.parent
# Les données vivent sur la branche « veille-data » en production (voir le workflow).
DATA = Path(os.environ.get("VEILLE_DATA_DIR") or ROOT / "data")
OUT = ROOT / "_site"

NIVEAUX = {1: "calme", 2: "normal", 3: "vigilance", 4: "tension", 5: "crise"}
ALERTE_BG = {1: "#e8f5e9", 2: "#f1f8e9", 3: "#fff8e1", 4: "#fbe9e7", 5: "#ffebee"}
MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
        "septembre", "octobre", "novembre", "décembre"]
JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]


def md(text: str) -> Markup:
    """Markdown minimal et sûr : échappement HTML, puis **gras** et *italique*."""
    s = str(escape(text or ""))
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<!\*)\*(?!\s)(.+?)(?<!\s)\*(?!\*)", r"<em>\1</em>", s)
    return Markup(s.replace("\n", "<br>"))


def fmt_num(x: float) -> str:
    s = f"{x:,.4f}" if abs(x) < 10 else (f"{x:,.2f}" if abs(x) < 10000 else f"{x:,.0f}")
    return s.replace(",", " ").replace(".", ",")


def date_label(iso_date: str) -> str:
    d = datetime.fromisoformat(iso_date)
    return f"{JOURS[d.weekday()]} {d.day} {MOIS[d.month - 1]} {d.year}"


def env() -> Environment:
    e = Environment(loader=FileSystemLoader(Path(__file__).parent / "templates"),
                    autoescape=select_autoescape(["html", "xml"]))
    e.filters["md"] = md
    # Adaptateurs données → format attendu par charts.js
    e.filters["pf_bar"] = lambda l: {"nom": l["nom"], "v": l["poids_pct"],
                                     "limite": 5 if l.get("type") == "action" else None,
                                     "alerte": l.get("type") == "action" and l["poids_pct"] > 5,
                                     "detail": f"Depuis ton prix de revient : {l['perf_pct']:+.1f} %"}
    e.filters["pf_seg"] = lambda i: {"nom": i["nom"][:1].upper() + i["nom"][1:], "v": i["pct"]}
    e.filters["pf_contrib"] = lambda c: {"nom": c["nom"], "v": c["pts"]}
    e.globals.update(fmt_num=fmt_num, niveaux=NIVEAUX)
    return e


def load_editions() -> list[dict]:
    eds = []
    for p in sorted((DATA / "editions").glob("*.json"), reverse=True):
        ed = json.loads(p.read_text())
        ed["slug"] = p.stem
        ed["href"] = f"editions/{p.stem}.html"
        ed["date_label"] = date_label(ed["date"])
        ed["type_label"] = "Édition hebdomadaire" if ed.get("mode") == "hebdo" else "Édition du jour"
        eds.append(ed)
    return eds


def _archive_entry(ed: dict) -> dict:
    gen = datetime.fromisoformat(ed["genere_le"])
    return {"href": ed["href"], "date_label": ed["date_label"], "type_label": ed["type_label"],
            "titre": ed["titre_edition"], "accroche": ed["accroche"], "rfc822": format_datetime(gen)}


def build_site(site_url: str = "") -> Path:
    e = env()
    if OUT.exists():
        shutil.rmtree(OUT)
    (OUT / "editions").mkdir(parents=True)
    for f in ("style.css", "charts.js", "live.js", "moi.js", "apprendre.js", "simu.js"):
        shutil.copy(ROOT / "site_assets" / f, OUT / f)
    # Données lues par le navigateur (le fil se rafraîchit sans recharger la page).
    (OUT / "data").mkdir()
    for f in ("live.json", "direct.json", "moi.enc.json"):
        if (DATA / f).exists():
            shutil.copy(DATA / f, OUT / "data" / f)

    eds = load_editions()
    archives = [_archive_entry(x) for x in eds]
    radar = json.loads((DATA / "radar.json").read_text()) if (DATA / "radar.json").exists() else []
    for r in radar:
        r["heure"] = datetime.fromisoformat(r["detecte_le"]).astimezone(PARIS).strftime("%d/%m %Hh%M")
    maj = datetime.now(PARIS).strftime("%d/%m/%Y à %Hh%M")

    def ctx(ed, root):
        m = ed.get("marches", []) if ed else []
        dates = [x["date"] for x in m if not x.get("indisponible")]
        return dict(ed=ed, marches=m, marches_date=max(dates) if dates else "", root=root, maj=maj,
                    archives=archives, radar=radar[:25], site_url=site_url, cap_url=os.environ.get("CAP2046_URL", ""))

    (OUT / "index.html").write_text(e.get_template("index.html").render(**ctx(eds[0] if eds else None, "")))
    for ed in eds:
        (OUT / ed["href"]).write_text(e.get_template("edition_page.html").render(**ctx(ed, "../")))
    (OUT / "portefeuille.html").write_text(e.get_template("portefeuille_page.html").render(**ctx(eds[0] if eds else None, "")))
    direct = json.loads((DATA / "direct.json").read_text()) if (DATA / "direct.json").exists() else {}
    (OUT / "direct.html").write_text(e.get_template("direct.html").render(
        **ctx(eds[0] if eds else None, ""), direct=direct))
    (OUT / "moi.html").write_text(e.get_template("moi.html").render(
        **ctx(None, ""), espace_dispo=(DATA / "moi.enc.json").exists()))
    (OUT / "archives.html").write_text(e.get_template("archives.html").render(**ctx(None, "")))
    (OUT / "feed.xml").write_text(e.get_template("feed.xml").render(archives=archives, site_url=site_url))
    _build_apprendre(e, ctx)
    (OUT / ".nojekyll").write_text("")
    return OUT


def _charger_dossier(nom: str) -> list[dict]:
    d = DATA / nom
    return [json.loads(p.read_text()) for p in sorted(d.glob("*.json"))] if d.exists() else []


def lexique_complet() -> list[dict]:
    """Lexique de base (config) + termes appris (cours, décryptages, réponses), triés alphabétiquement."""
    import unicodedata
    import yaml
    base = yaml.safe_load((ROOT / "config" / "lexique_base.yml").read_text())["termes"]
    lex = {t["terme"].strip().lower(): {**t, "origine": {"type": "base"}} for t in base}
    appris = json.loads((DATA / "lexique.json").read_text()) if (DATA / "lexique.json").exists() else {}
    for k, t in appris.items():
        lex.setdefault(k, t)
    cle = lambda t: unicodedata.normalize("NFKD", t["terme"]).encode("ascii", "ignore").decode().lower()
    out = sorted(lex.values(), key=cle)
    for t in out:
        t["ancre"] = re.sub(r"[^a-z0-9]+", "-", cle(t)).strip("-")
        t["lettre"] = (cle(t)[:1] or "#").upper()
    return out


def _build_apprendre(e, ctx):
    import yaml
    # Académie
    modules = yaml.safe_load((ROOT / "config" / "academie.yml").read_text())["modules"]
    publies = {c["numero"]: c for c in _charger_dossier("academie")}
    n, plan = 0, []
    for m in modules:
        sems = []
        for sem in m["semaines"]:
            n += 1
            c = publies.get(n)
            sems.append({"numero": n, "titre": c["titre"] if c else sem["titre"], "publie": bool(c),
                         "date": date_label(c["publie_le"][:10]) if c else "", "notions": sem.get("notions", [])})
        plan.append({"titre": m["titre"], "id": m["id"], "semaines": sems})
    total, faits = n, len(publies)
    (OUT / "academie").mkdir()
    (OUT / "academie.html").write_text(e.get_template("academie.html").render(**ctx(None, ""), plan=plan, total=total, faits=faits))
    nums = sorted(publies)
    for i, k in enumerate(nums):
        c = publies[k]
        prev = publies.get(nums[i - 1]) if i > 0 else None
        nxt = publies.get(nums[i + 1]) if i + 1 < len(nums) else None
        (OUT / "academie" / f"{k:02d}.html").write_text(e.get_template("cours.html").render(
            **ctx(None, "../"), c=c, prev=prev, nxt=nxt, total=total, date_c=date_label(c["publie_le"][:10])))
    # Décryptages
    decs = sorted(_charger_dossier("decryptages"), key=lambda d: d["publie_le"], reverse=True)
    for d in decs:
        d["date_label"] = date_label(d["publie_le"][:10])
        d["heure"] = d["publie_le"][11:16].replace(":", "h")
    (OUT / "decryptages").mkdir()
    (OUT / "decryptages.html").write_text(e.get_template("decryptages.html").render(**ctx(None, ""), decs=decs))
    for d in decs:
        (OUT / "decryptages" / f"{d['slug']}.html").write_text(e.get_template("decryptage.html").render(**ctx(None, "../"), d=d))
    # Questions
    qs = sorted(_charger_dossier("questions"), key=lambda q: q["publie_le"], reverse=True)
    for q in qs:
        q["date_label"] = date_label(q["publie_le"][:10])
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    (OUT / "questions.html").write_text(e.get_template("questions.html").render(**ctx(None, ""), qs=qs, repo=repo))
    # Lexique et simulateur
    lex = lexique_complet()
    (OUT / "lexique.html").write_text(e.get_template("lexique.html").render(**ctx(None, ""), lex=lex,
                                      lettres=sorted({t["lettre"] for t in lex})))
    (OUT / "simulateur.html").write_text(e.get_template("simulateur.html").render(**ctx(None, "")))


def render_cours_email(c: dict, site_url: str = "") -> str:
    return env().get_template("cours_email.html").render(c=c, site_url=site_url)


def render_email(ed: dict, site_url: str = "") -> str:
    m = ed.get("marches", [])
    return env().get_template("email.html").render(
        ed=ed, marches=m, site_url=site_url, alerte_bg=ALERTE_BG.get(ed["alerte"]["niveau"], "#f5f5f5"))


def render_flash(items: list[dict]) -> str:
    return env().get_template("flash.html").render(items=items, heure=datetime.now(PARIS).strftime("%d/%m %Hh%M"))
