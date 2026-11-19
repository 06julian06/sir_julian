"""Collecte brute : flux RSS et cotations. Aucune IA ici — uniquement des faits."""
from __future__ import annotations

import csv
import hashlib
import io
import logging
import re
import urllib.request
from datetime import datetime, timedelta, timezone

import feedparser

log = logging.getLogger(__name__)
UA = "Mozilla/5.0 (compatible; veille-finance-bot/1.0)"


def _http_get(url: str, timeout: int = 20) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def item_id(url: str, titre: str) -> str:
    return hashlib.sha1((url or titre).encode()).hexdigest()[:16]


def fetch_feeds(flux: list[dict], max_age_hours: int = 48, per_feed: int = 25) -> list[dict]:
    """Retourne les articles récents de tous les flux, dédoublonnés, du plus récent au plus ancien."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)
    items: dict[str, dict] = {}
    for f in flux:
        try:
            parsed = feedparser.parse(_http_get(f["url"]))
        except Exception as e:  # un flux mort ne doit jamais bloquer la veille
            log.warning("Flux ignoré (%s) : %s", f["nom"], e)
            continue
        for e in parsed.entries[:per_feed]:
            ts = e.get("published_parsed") or e.get("updated_parsed")
            date = datetime(*ts[:6], tzinfo=timezone.utc) if ts else datetime.now(timezone.utc)
            if date < cutoff:
                continue
            url = e.get("link", "")
            titre = (e.get("title") or "").strip()
            if not titre:
                continue
            resume = (e.get("summary") or "").strip()
            # On retire le HTML : l'IA n'a besoin que du texte.
            resume = re.sub(r"<[^>]+>", " ", resume)
            resume = re.sub(r"\s+", " ", resume)[:500]
            iid = item_id(url, titre)
            items[iid] = {
                "id": iid,
                "titre": titre,
                "url": url,
                "source": f["nom"],
                "categorie": f.get("categorie", "divers"),
                "date": date.isoformat(),
                "resume": resume,
            }
    out = sorted(items.values(), key=lambda x: x["date"], reverse=True)
    log.info("%d articles collectés sur %d flux", len(out), len(flux))
    return out


_CACHE: dict[str, list[dict]] = {}


def _stooq_history(sym: str) -> list[dict]:
    if sym in _CACHE:
        return _CACHE[sym]
    raw = _http_get(f"https://stooq.com/q/d/l/?s={sym}&i=d").decode()
    data = list(csv.DictReader(io.StringIO(raw)))
    if len(data) < 2 or "Close" not in data[-1]:
        raise ValueError(f"pas de données pour {sym}")
    _CACHE[sym] = data
    return data


def price_series(sym: str, jours: int = 365) -> dict | None:
    """Série de clôtures sur ~1 an (pour les graphiques)."""
    try:
        data = _stooq_history(sym)
    except Exception as e:
        log.warning("Historique indisponible (%s) : %s", sym, e)
        return None
    debut = (datetime.now(timezone.utc) - timedelta(days=jours)).date().isoformat()
    pts = [(r["Date"], float(r["Close"])) for r in data if r["Date"] >= debut]
    return {"dates": [d for d, _ in pts], "valeurs": [round(v, 4) for _, v in pts]}


def fetch_markets(marches: list[dict]) -> list[dict]:
    """Cotations de clôture + variation journalière via Stooq (CSV, sans clé API)."""
    rows = []
    for m in marches:
        sym = m["symbole"]
        try:
            data = _stooq_history(sym)
            last, prev = data[-1], data[-2]
            close, pclose = float(last["Close"]), float(prev["Close"])
            # Variation sur ~1 an (≈ 252 séances) pour donner de la perspective.
            yr = data[-253] if len(data) > 253 else data[0]
            rows.append({
                "nom": m["nom"],
                "symbole": sym,
                "date": last["Date"],
                "cloture": close,
                "var_jour_pct": round((close / pclose - 1) * 100, 2),
                "var_1an_pct": round((close / float(yr["Close"]) - 1) * 100, 1),
                "est_taux": sym.endswith(".b"),
                # Pour un taux, la variation utile est en points de base, pas en %.
                "var_jour_pb": round((close - pclose) * 100, 1),
                # 60 dernières clôtures pour la mini-courbe du tableau de bord.
                "spark": [round(float(r["Close"]), 4) for r in data[-60:]],
            })
        except Exception as e:
            log.warning("Cotation indisponible (%s) : %s", m["nom"], e)
            rows.append({"nom": m["nom"], "symbole": sym, "indisponible": True})
    return rows


def fetch_portfolio(conf: dict) -> dict | None:
    """Valorise le portefeuille aux derniers cours. Tous les calculs sont faits ici, pas par l'IA."""
    positions = (conf or {}).get("positions") or []
    if not positions:
        return None
    eurusd = None
    lignes, total = [], float(conf.get("liquidites") or 0)
    for p in positions:
        l = {k: p.get(k) for k in ("nom", "symbole", "type", "enveloppe", "zone", "secteur")}
        l["devise"] = p.get("devise", "EUR")
        try:
            data = _stooq_history(p["symbole"])
            cours, prev = float(data[-1]["Close"]), float(data[-2]["Close"])
            fx = 1.0
            if l["devise"] == "USD":
                if eurusd is None:
                    eurusd = float(_stooq_history("eurusd")[-1]["Close"])
                fx = 1 / eurusd
            qte, pru = float(p["quantite"]), float(p["pru"])
            l.update(cours=cours, date=data[-1]["Date"], var_jour_pct=round((cours / prev - 1) * 100, 2),
                     valeur_eur=round(qte * cours * fx, 2), pv_eur=round(qte * (cours - pru) * fx, 2),
                     perf_pct=round((cours / pru - 1) * 100, 2))
            total += l["valeur_eur"]
        except Exception as e:
            log.warning("Position non valorisée (%s) : %s", p.get("nom"), e)
            l["indisponible"] = True
        lignes.append(l)
    ok = [l for l in lignes if not l.get("indisponible")]
    for l in ok:
        l["poids_pct"] = round(l["valeur_eur"] / total * 100, 1) if total else 0
    investi = sum(l["valeur_eur"] - l["pv_eur"] for l in ok)
    var_jour_eur = sum(l["valeur_eur"] * (1 - 1 / (1 + l["var_jour_pct"] / 100)) for l in ok)
    alertes = [f"{l['nom']} pèse {l['poids_pct']} % (règle : 5 % max par action)"
               for l in ok if l.get("type") == "action" and l["poids_pct"] > 5]
    return {
        "historique": _historique(positions, conf.get("indice_reference") or {}),
        "repartition": _repartition(ok, float(conf.get("liquidites") or 0), total),
        "contrib_jour": sorted(
            [{"nom": l["nom"], "pts": round(l["poids_pct"] * l["var_jour_pct"] / 100, 3)} for l in ok],
            key=lambda c: c["pts"], reverse=True),
        "lignes": sorted(lignes, key=lambda l: l.get("valeur_eur", 0), reverse=True),
        "total_eur": round(total, 2),
        "liquidites_eur": float(conf.get("liquidites") or 0),
        "pv_eur": round(sum(l["pv_eur"] for l in ok), 2),
        "perf_pct": round((sum(l["valeur_eur"] for l in ok) / investi - 1) * 100, 2) if investi else 0,
        "var_jour_eur": round(var_jour_eur, 2),
        "var_jour_pct": round(var_jour_eur / (total - var_jour_eur) * 100, 2) if total else 0,
        "alertes_regles": alertes,
        "afficher_montants_sur_site": bool(conf.get("afficher_montants_sur_site")),
        "note": "Performances en devise de cotation ; valeurs converties en EUR au dernier cours EUR/USD.",
    }


def _repartition(ok: list[dict], liquidites: float, total: float) -> dict:
    """Poids agrégés par enveloppe, type, zone et secteur (en % du total, liquidités incluses)."""
    out = {}
    for axe in ("enveloppe", "type", "zone", "secteur"):
        agg: dict[str, float] = {}
        for l in ok:
            k = l.get(axe) or "Non renseigné"
            agg[k] = agg.get(k, 0) + l["valeur_eur"]
        if liquidites and axe in ("enveloppe", "type"):
            agg["Liquidités"] = agg.get("Liquidités", 0) + liquidites
        if set(agg) <= {"Non renseigné", "Liquidités"}:
            continue  # axe non renseigné dans la config : pas de graphique
        out[axe] = sorted(({"nom": k, "pct": round(v / total * 100, 1)} for k, v in agg.items() if total),
                          key=lambda x: x["pct"], reverse=True)
    return out


def _historique(positions: list[dict], indice: dict, jours: int = 365) -> dict | None:
    """Performance base 100 sur 1 an À COMPOSITION ACTUELLE CONSTANTE, comparée à un indice.
    Ce n'est pas ta performance réelle passée (tes achats/ventes ne sont pas connus) : c'est
    « ce qu'aurait fait ton portefeuille actuel », la façon standard de juger une allocation."""
    try:
        fx = {r["Date"]: float(r["Close"]) for r in _stooq_history("eurusd")} \
            if any(p.get("devise") == "USD" for p in positions) else {}
        series = []
        for p in positions:
            try:
                h = {r["Date"]: float(r["Close"]) for r in _stooq_history(p["symbole"])}
            except Exception:
                continue
            series.append((float(p["quantite"]), p.get("devise", "EUR"), h))
        if not series:
            return None
        debut = (datetime.now(timezone.utc) - timedelta(days=jours)).date().isoformat()
        dates = sorted(set.intersection(*(set(h) for _, _, h in series)))
        dates = [d for d in dates if d >= debut]
        valeurs, last_fx = [], None
        for d in dates:
            if fx:
                last_fx = fx.get(d, last_fx)
                if last_fx is None:
                    continue
            valeurs.append((d, sum(q * h[d] / (last_fx if dev == "USD" else 1) for q, dev, h in series)))
        if len(valeurs) < 10:
            return None
        base = valeurs[0][1]
        out = {"dates": [d for d, _ in valeurs], "portefeuille": [round(v / base * 100, 2) for _, v in valeurs]}
        if indice.get("symbole"):
            try:
                ih = {r["Date"]: float(r["Close"]) for r in _stooq_history(indice["symbole"])}
                pts, lastv = [], None
                for d in out["dates"]:
                    lastv = ih.get(d, lastv)
                    pts.append(lastv)
                ib = next(v for v in pts if v is not None)
                out["indice"] = [round(v / ib * 100, 2) if v is not None else None for v in pts]
                out["indice_nom"] = indice.get("nom", indice["symbole"])
            except Exception as e:
                log.warning("Indice de référence indisponible : %s", e)
        return out
    except Exception as e:
        log.warning("Historique du portefeuille impossible : %s", e)
        return None
