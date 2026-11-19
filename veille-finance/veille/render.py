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
    for f in ("style.css", "charts.js", "live.js", "moi.js"):
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
                    archives=archives, radar=radar[:25], site_url=site_url)

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
    (OUT / ".nojekyll").write_text("")
    return OUT


def render_email(ed: dict, site_url: str = "") -> str:
    m = ed.get("marches", [])
    return env().get_template("email.html").render(
        ed=ed, marches=m, site_url=site_url, alerte_bg=ALERTE_BG.get(ed["alerte"]["niveau"], "#f5f5f5"))


def render_flash(items: list[dict]) -> str:
    return env().get_template("flash.html").render(items=items, heure=datetime.now(PARIS).strftime("%d/%m %Hh%M"))
