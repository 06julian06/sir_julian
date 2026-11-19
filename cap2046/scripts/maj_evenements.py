#!/usr/bin/env python3
"""Met à jour data/events.json à partir des SOURCES OFFICIELLES vérifiées.

Automatisé (pages officielles lues et analysées) :
  Fed (FOMC), BCE, Banque d'Angleterre, Banque du Japon, BEA (PIB + inflation PCE, flux ICS),
  Euronext (jours fermés / demi-séances Paris), NYSE (jours fermés / clôtures anticipées),
  TotalEnergies (calendrier financier).
Manuel (data/events_manuels.json) : tout le reste, avec son statut de vérification.

Règles :
  - Une source qui échoue ne casse rien : ses événements précédents sont conservés tels quels,
    avec leur ancienne date de vérification (le site signale les vérifications de plus de 30 jours).
  - Aucune date n'est inventée : seul ce qui est lu sur la page officielle est publié.

Usage : python3 scripts/maj_evenements.py   (Python 3.10+, bibliothèque standard uniquement)
"""
from __future__ import annotations

import html
import json
import re
import sys
import urllib.request
from datetime import date, datetime, time, timezone
from html.parser import HTMLParser
from pathlib import Path
from zoneinfo import ZoneInfo

RACINE = Path(__file__).resolve().parent.parent
SORTIE = RACINE / "data" / "events.json"
MANUELS = RACINE / "data" / "events_manuels.json"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
AUJ = date.today()
DEBUT, FIN = AUJ.replace(day=1), date(AUJ.year + 1, AUJ.month, 28)  # ~12 mois glissants

MOIS_EN = {m: i for i, m in enumerate(["january", "february", "march", "april", "may", "june", "july", "august",
                                       "september", "october", "november", "december"], start=1)}
MOIS_ABR = {"jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "june": 6, "jun": 6, "july": 7, "jul": 7,
            "aug": 8, "sept": 9, "sep": 9, "oct": 10, "nov": 11, "dec": 12}


FERIES_FR = {"new year": "jour de l'an", "christmas": "Noël", "boxing": "lendemain de Noël", "good friday": "Vendredi saint",
             "easter monday": "lundi de Pâques", "labour day": "fête du Travail", "thanksgiving": "Thanksgiving",
             "martin luther king": "Martin Luther King Day", "washington": "Presidents' Day", "memorial": "Memorial Day",
             "juneteenth": "Juneteenth", "independence": "fête nationale américaine", "labor day": "Labor Day",
             "whit monday": "lundi de Pentecôte", "ascension": "Ascension"}
MOIS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]


def ferie_fr(nom: str) -> str:
    n = nom.lower()
    for k, v in FERIES_FR.items():
        if k in n:
            return v
    return nom


def periode_fr(txt: str) -> str:
    """'October 2026' → 'octobre 2026'."""
    def rep(m):
        return f"{MOIS_FR[MOIS_EN[m.group(1).lower()] - 1]} {m.group(2)}"
    return re.sub(r"(January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})", rep, txt)


def lire(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9,fr;q=0.8"})
    with urllib.request.urlopen(req, timeout=45) as r:
        return r.read().decode("utf-8", errors="replace")


def utc(d: date, h: int, m: int, tz: str) -> str:
    return datetime.combine(d, time(h, m), ZoneInfo(tz)).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class Tableaux(HTMLParser):
    """Extrait toutes les tables HTML en listes de lignes de cellules texte."""

    def __init__(self):
        super().__init__()
        self.tables, self._pile, self._ligne, self._cell = [], [], None, None

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self._pile.append([])
        elif tag == "tr" and self._pile:
            self._ligne = []
        elif tag in ("td", "th") and self._ligne is not None:
            self._cell = []

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self._cell is not None and self._ligne is not None:
            self._ligne.append(re.sub(r"\s+", " ", "".join(self._cell)).strip())
            self._cell = None
        elif tag == "tr" and self._ligne is not None and self._pile:
            self._pile[-1].append(self._ligne)
            self._ligne = None
        elif tag == "table" and self._pile:
            self.tables.append(self._pile.pop())

    def handle_data(self, d):
        if self._cell is not None:
            self._cell.append(d)


def tables(src: str) -> list[list[list[str]]]:
    p = Tableaux()
    p.feed(src)
    return p.tables


def texte(src: str) -> str:
    src = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", src, flags=re.S)
    t = html.unescape(re.sub(r"<[^>]+>", " | ", src))
    return re.sub(r"\s+", " ", re.sub(r"(\s*\|\s*)+", " | ", t))


def ev(id_, d: date, titre, source_nom, source_url, *, dt_utc=None, heure_verifiee=False, note="", **gabarit):
    return {"id": id_, "date": d.isoformat(), "datetime_utc": dt_utc, "heure_verifiee": heure_verifiee,
            "titre": titre, "source_nom": source_nom, "source_url": source_url, "verifie": True,
            "verifie_le": AUJ.isoformat(), "note_verification": note, "auto": True, **gabarit}


# ─── Gabarits : pourquoi ça bouge, scénarios, exposition ─────────────────────

G = {
    "fed": dict(categorie="banque_centrale", importance=3, zones=["US"],
                description="Le FOMC (comité de la Fed qui fixe les taux directeurs américains) décide du coût de l'argent aux États-Unis. Les taux font bouger la valorisation de toutes les actions, surtout la tech américaine, très présente dans ton ETF Monde et ton Nasdaq.",
                haussier="Baisse des taux ou discours plus souple qu'attendu : les actions de croissance (tech US) montent, le dollar baisse.",
                baissier="Taux maintenus plus haut plus longtemps : pression sur la tech US et sur ton ETF Monde (≈ 70 % d'actions américaines)."),
    "bce": dict(categorie="banque_centrale", importance=3, zones=["ZoneEuro"],
                description="La BCE fixe les taux de la zone euro. Ses décisions pèsent sur les banques, l'immobilier et toutes les actions européennes de ton ETF Europe, ainsi que sur Saint-Gobain (sensible à la construction).",
                haussier="Baisse des taux ou ton accommodant : soutien aux actions européennes et aux secteurs liés au crédit (construction).",
                baissier="Taux maintenus ou durcis face à l'inflation : pression sur les valeurs cycliques européennes."),
    "boe": dict(categorie="banque_centrale", importance=2, zones=["UK"],
                description="La Banque d'Angleterre fixe les taux britanniques. Le Royaume-Uni pèse environ un cinquième de ton ETF Europe (Stoxx 600).",
                haussier="Baisse des taux : soutien aux actions britanniques.",
                baissier="Hausse ou maintien des taux : pression sur les actions britanniques et la livre."),
    "boj": dict(categorie="banque_centrale", importance=2, zones=["Japon"],
                description="La Banque du Japon est la dernière grande banque centrale à sortir des taux très bas. Une hausse surprise peut provoquer des ventes en chaîne sur les marchés mondiaux (débouclage du « carry trade » : emprunter en yen pour investir ailleurs).",
                haussier="Statu quo attendu et bien communiqué : peu d'effet.",
                baissier="Hausse surprise : yen en forte hausse, ventes rapides sur les actions mondiales (cas d'août 2024)."),
    "pib_us": dict(categorie="macro", importance=2, zones=["US"],
                   description="Le PIB (produit intérieur brut : la richesse produite par le pays) mesure la croissance américaine. Publié avec les revenus et dépenses des ménages et l'indice PCE (l'indicateur d'inflation préféré de la Fed).",
                   haussier="Croissance solide et inflation PCE en baisse : scénario idéal pour les actions.",
                   baissier="Croissance qui cale ou inflation PCE qui remonte : crainte de récession ou de taux durablement hauts."),
    "pce_us": dict(categorie="macro", importance=2, zones=["US"],
                   description="Revenus et dépenses des ménages américains, avec l'indice PCE : l'indicateur d'inflation que la Fed surveille en priorité pour décider de ses taux.",
                   haussier="Inflation PCE en recul : ouvre la porte à des baisses de taux.",
                   baissier="Inflation PCE qui accélère : éloigne les baisses de taux, pression sur la tech US."),
    "ferm_paris": dict(categorie="marche", importance=1, zones=[],
                       description="Euronext Paris, où sont cotés tous tes ETF PEA et Saint-Gobain. Un ordre passé ce jour-là ne sera pas exécuté (fermé) ou seulement le matin (demi-séance).",
                       haussier="Sans effet sur la valeur de ton portefeuille.",
                       baissier="Sans effet ; évite seulement de programmer un versement ce jour-là."),
    "ferm_nyse": dict(categorie="marche", importance=1, zones=["US"],
                      description="Bourse de New York fermée ou fermant tôt. Les volumes sont faibles autour de ces dates ; les ETF cotés à Paris qui répliquent des actions américaines (Monde, Nasdaq) ont des prix moins précis pendant la fermeture de New York.",
                      haussier="Sans effet durable.",
                      baissier="Sans effet durable ; écarts de prix plus larges ce jour-là sur tes ETF Monde et Nasdaq."),
    "resultats": dict(categorie="resultats", importance=2, zones=[],
                      description="Publication des résultats annuels. Les chiffres et les perspectives de l'entreprise font bouger son cours, et donc (un peu) les ETF qui la contiennent.",
                      haussier="Résultats et perspectives meilleurs qu'attendu.",
                      baissier="Résultats décevants ou perspectives abaissées."),
}


# ─── Sources ──────────────────────────────────────────────────────────────────

def src_fed():
    url = "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm"
    s = lire(url)
    out = []
    for annee in re.findall(r"(\d{4}) FOMC Meetings</a>", s):
        bloc = re.search(rf"{annee} FOMC Meetings</a>(.*?)(?=\d{{4}} FOMC Meetings</a>|$)", s, re.S).group(1)
        for mois, jours in re.findall(r"fomc-meeting__month[^>]*>\s*<strong>([^<]+)</strong>.*?fomc-meeting__date[^>]*>([^<]+)<", bloc, re.S):
            mois, jours = mois.strip(), html.unescape(jours).strip()
            m = MOIS_EN.get(mois.split("/")[-1].strip().lower())
            nums = re.findall(r"\d+", jours)
            if not m or not nums:
                continue
            m2 = MOIS_EN.get(mois.split("/")[-1].strip().lower())  # réunions à cheval sur 2 mois : on prend le 2e
            d = date(int(annee), m2, int(nums[-1]))
            sep = "*" in jours
            out.append(ev(f"fed-{d}", d, "Fed (FOMC) : décision sur les taux" + (" + projections" if sep else ""),
                          "Federal Reserve — calendrier FOMC", url, dt_utc=utc(d, 14, 0, "America/New_York"),
                          note="Date lue sur la page officielle. Heure = horaire habituel du communiqué (14h00 à New York), non indiqué sur cette page."
                               + (" L'astérisque indique la publication des projections économiques (SEP)." if sep else ""), **G["fed"]))
    return out


def src_bce():
    url = "https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html"
    lignes = [l.strip() for l in texte(lire(url)).split("|") if l.strip()]
    out = []
    for i, l in enumerate(lignes):
        m = re.fullmatch(r"(\d{2})/(\d{2})/(\d{4})", l)
        if m and i + 1 < len(lignes) and re.search(r"monetary policy meeting.*press conference", lignes[i + 1], re.I):
            d = date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
            out.append(ev(f"bce-{d}", d, "BCE : décision sur les taux + conférence de presse", "BCE — calendrier du Conseil des gouverneurs", url,
                          dt_utc=utc(d, 14, 15, "Europe/Berlin"),
                          note="Date lue sur la page officielle. Heure = horaire habituel de la décision (14h15 à Francfort), non indiqué sur cette page.", **G["bce"]))
    return out


def src_boe():
    url = "https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates"
    t = texte(lire(url))
    out = []
    for annee, bloc in re.findall(r"(\d{4}) confirmed dates(.*?)(?=\d{4} confirmed dates|Monetary Policy Committee voting history|$)", t, re.S):
        for j, mois in re.findall(r"(?:Monday|Tuesday|Wednesday|Thursday|Friday) (\d{1,2}) ([A-Z][a-z]+)", bloc):
            if mois.lower() not in MOIS_EN:
                continue
            d = date(int(annee), MOIS_EN[mois.lower()], int(j))
            out.append(ev(f"boe-{d}", d, "Banque d'Angleterre : décision sur les taux", "Bank of England — dates du MPC", url,
                          dt_utc=utc(d, 12, 0, "Europe/London"),
                          note="Date lue sur la page officielle. Heure = horaire habituel (12h00 à Londres), non indiqué sur cette page.", **G["boe"]))
    return out


def src_boj():
    url = "https://www.boj.or.jp/en/mopo/mpmsche_minu/index.htm"
    s = lire(url)
    out = []
    morceaux = re.split(r"<h2[^>]*>\s*(\d{4})\s*</h2>", s)
    for k in range(1, len(morceaux) - 1, 2):
        annee, bloc = int(morceaux[k]), morceaux[k + 1]
        tbs = tables(bloc)
        if not tbs:
            continue
        for ligne in tbs[0]:
            if not ligne:
                continue
            c = ligne[0]
            m = re.match(r"([A-Z][a-z]+)\.?\s+\d{1,2}", c)
            mois = MOIS_ABR.get(m.group(1).lower()) or MOIS_ABR.get(m.group(1).lower()[:3]) if m else None
            if not mois:
                continue
            jours = [int(x) for x in re.findall(r"(?<![\d,])(\d{1,2})\s*\(", c)]
            if not jours:
                continue
            d = date(annee, mois, jours[-1])  # dernier jour de la réunion = jour de la décision
            out.append(ev(f"boj-{d}", d, "Banque du Japon : décision sur les taux", "Bank of Japan — calendrier des réunions", url,
                          note="Date lue sur la page officielle (dernier jour de la réunion). Heure non fixe : annonce en fin de réunion, heure de Tokyo.",
                          **G["boj"]))
    return out


def src_bea():
    url = "https://www.bea.gov/news/schedule/ics/online-calendar-subscription.ics"
    s = lire(url).replace("\r\n ", "").replace("\n ", "")
    out = []
    for bloc in s.split("BEGIN:VEVENT")[1:]:
        dt = re.search(r"DTSTART[^:\n]*:(\d{8}T\d{6}Z)", bloc)
        su = re.search(r"SUMMARY:(.*)", bloc)
        if not (dt and su):
            continue
        titre = su.group(1).strip().replace("\\,", ",")
        x = datetime.strptime(dt.group(1), "%Y%m%dT%H%M%SZ")
        d = x.date()
        if titre.startswith("GDP") and "County" not in titre and "State" not in titre.split(",")[0]:
            est = re.search(r"\((Advance|Second|Third) Estimate\)", titre)
            trim = re.search(r"(\d)(?:st|nd|rd|th) Quarter(?: and Year)? (\d{4})", titre)
            nom = {"Advance": "1re estimation", "Second": "2e estimation", "Third": "3e estimation"}.get(est.group(1) if est else "", "")
            t_fr = f"États-Unis : PIB T{trim.group(1)} {trim.group(2)} ({nom})" if trim else "États-Unis : PIB"
            g = dict(G["pib_us"])
            if est and est.group(1) == "Advance":
                g["importance"] = 3
            out.append(ev(f"bea-pib-{d}", d, t_fr, "BEA — calendrier officiel (flux ICS)", "https://www.bea.gov/news/schedule",
                          dt_utc=x.strftime("%Y-%m-%dT%H:%M:%SZ"), heure_verifiee=True,
                          note=f"Date et heure lues dans le flux officiel du BEA. Intitulé officiel : « {titre} ».", **g))
        elif titre.startswith("Personal Income and Outlays"):
            per = periode_fr(titre.split(",", 1)[-1].strip())
            out.append(ev(f"bea-pce-{d}", d, f"États-Unis : inflation PCE et dépenses des ménages ({per})", "BEA — calendrier officiel (flux ICS)",
                          "https://www.bea.gov/news/schedule", dt_utc=x.strftime("%Y-%m-%dT%H:%M:%SZ"), heure_verifiee=True,
                          note=f"Date et heure lues dans le flux officiel du BEA. Intitulé officiel : « {titre} ».", **G["pce_us"]))
    return out


def _jours_libelle(lib: str):
    """'Thursday 24 December 2026 (...)' ou 'Monday 21 to Wednesday 23 December 2026' → [dates]."""
    m = re.search(r"(January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})", lib)
    if not m:
        return []
    mois, annee = MOIS_EN[m.group(1).lower()], int(m.group(2))
    avant = lib[:m.start()]
    nums = [int(x) for x in re.findall(r"(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) (\d{1,2})", avant)]
    if " to " in avant and len(nums) == 2:
        nums = list(range(nums[0], nums[1] + 1))
    return [date(annee, mois, n) for n in nums]


def src_euronext():
    url = "https://www.euronext.com/en/trading-calendars-hours"
    out = []
    for tb in tables(lire(url)):
        if not tb or "Paris" not in tb[0]:
            continue
        col = tb[0].index("Paris")
        for ligne in tb[1:]:
            if len(ligne) <= col:
                continue
            statut = ligne[col].lower()
            if "closed" not in statut and "half" not in statut:
                continue
            ferme = "closed" in statut
            for d in _jours_libelle(ligne[0]):
                raison = re.search(r"\(([^)]+)\)", ligne[0])
                out.append(ev(f"euronext-{d}", d, ("Euronext Paris fermé" if ferme else "Euronext Paris : demi-séance")
                              + (f" ({ferie_fr(raison.group(1))})" if raison else ""), "Euronext — calendrier officiel", url,
                              note="Lu dans le tableau officiel des jours fériés Euronext (colonne Paris).", **G["ferm_paris"]))
    return out


def src_nyse():
    url = "https://www.nyse.com/markets/hours-calendars"
    s = lire(url)
    out = []
    for tb in tables(s):
        if not tb or tb[0][:1] != ["Holiday"]:
            continue
        annees = tb[0][1:]
        for ligne in tb[1:]:
            for k, cell in enumerate(ligne[1:]):
                m = re.search(r"([A-Z][a-z]+) (\d{1,2})", cell)
                if not m or k >= len(annees) or m.group(1).lower() not in MOIS_EN:
                    continue
                d = date(int(annees[k]), MOIS_EN[m.group(1).lower()], int(m.group(2)))
                out.append(ev(f"nyse-{d}", d, f"Bourse de New York fermée ({ferie_fr(ligne[0])})", "NYSE — jours fériés officiels", url,
                              note="Lu dans le tableau officiel des jours fériés NYSE.", **G["ferm_nyse"]))
    for m in re.finditer(r"close early at 1:00 p\.m\.(.{0,300}?)NYSE American", texte(s)):
        for mo, j, a in re.findall(r"([A-Z][a-z]+) (\d{1,2}), (\d{4})", m.group(1)):
            if mo.lower() not in MOIS_EN:
                continue
            d = date(int(a), MOIS_EN[mo.lower()], int(j))
            out.append(ev(f"nyse-early-{d}", d, "Bourse de New York : clôture anticipée à 13h00 (New York)", "NYSE — jours fériés officiels", url,
                          dt_utc=utc(d, 13, 0, "America/New_York"), heure_verifiee=True,
                          note="Lu dans les notes officielles du calendrier NYSE.", **G["ferm_nyse"]))
    return out


def src_total():
    url = "https://totalenergies.com/news/calendar"
    t = texte(lire(url))
    out = []
    for mm, jj, aa, lib in re.findall(r"(\d{2})/(\d{2}) \| (\d{4}) \| ((?:\d \| [a-z]{2} \| )?[^|]*?Results)", t):
        lib = re.sub(r"(\d) \| ([a-z]{2}) \| ", r"\1\2 ", lib).strip()
        d = date(int(aa), int(mm), int(jj))
        g = dict(G["resultats"], societes=["TotalEnergies"])
        q = re.match(r"(\d)(?:st|nd|rd|th) Quarter(?: and Full-Year)? (\d{4}) Results", lib)
        if q:
            titre = f"TotalEnergies : résultats du {q.group(1)}e trimestre {q.group(2)}" + (" et de l'année" if "Full-Year" in lib else "")
        else:
            titre = f"TotalEnergies : {lib.replace('Half', 'semestre').replace('Results', 'résultats')}"
        out.append(ev(f"tte-{d}", d, titre,
                      "TotalEnergies — calendrier financier officiel", url,
                      note=f"Lu sur le calendrier officiel de TotalEnergies (« {lib} »). Heure non indiquée.", **g))
    return out


SOURCES = {"fed": src_fed, "bce": src_bce, "boe": src_boe, "boj": src_boj, "bea": src_bea,
           "euronext": src_euronext, "nyse": src_nyse, "tte": src_total}


def main() -> int:
    ancien = json.loads(SORTIE.read_text()) if SORTIE.exists() else {"events": [], "sources_statut": {}}
    anciens_auto = [e for e in ancien.get("events", []) if e.get("auto")]
    statut = dict(ancien.get("sources_statut", {}))
    events = []
    for cle, fn in SOURCES.items():
        try:
            evs = [e for e in fn() if DEBUT.isoformat() <= e["date"] <= FIN.isoformat()]
            if not evs:
                raise ValueError("aucun événement lu : structure de la page peut-être modifiée")
            events += evs
            statut[cle] = {"ok": True, "le": AUJ.isoformat(), "n": len(evs), "message": ""}
            print(f"[ok] {cle}: {len(evs)} événements")
        except Exception as e:
            garde = [x for x in anciens_auto if x["id"].split("-")[0] == cle.split("-")[0] or x["id"].startswith(cle)]
            events += garde
            statut[cle] = {"ok": False, "le": statut.get(cle, {}).get("le"), "n": len(garde), "message": str(e)[:200]}
            print(f"[ÉCHEC] {cle}: {e} — {len(garde)} anciens événements conservés", file=sys.stderr)
    manuels = json.loads(MANUELS.read_text())
    tous = {e["id"]: e for e in events}
    for e in manuels["events"]:
        tous.setdefault(e["id"], {**e, "auto": False})
    liste = sorted(tous.values(), key=lambda e: (e["date"], e.get("datetime_utc") or "", e["id"]))
    SORTIE.write_text(json.dumps({
        "genere_le": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sources_statut": statut,
        "events": liste,
        "a_confirmer": manuels.get("a_confirmer", []),
    }, ensure_ascii=False, indent=1))
    print(f"{len(liste)} événements écrits dans {SORTIE.relative_to(RACINE)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
