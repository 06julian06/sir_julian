"""Ton espace personnel : états financiers, ratios, gamification, puis chiffrement.

Tous les calculs sont déterministes (Python). L'IA ne fait que commenter.
Rien de ce module n'est publié en clair : la sortie est chiffrée (AES-256-GCM, clé dérivée
de ta phrase secrète par PBKDF2-SHA256) et seul ton navigateur peut la déchiffrer.
"""
from __future__ import annotations

import base64
import json
import os
from datetime import date

PBKDF2_ITERATIONS = 600_000


def _somme(lignes, champ="montant"):
    return round(sum(float(l.get(champ) or 0) for l in lignes or []), 2)


def _ratio(a, b):
    return round(a / b * 100, 1) if b else None


# ─── États financiers ─────────────────────────────────────────────────────────

def etats_financiers(fin: dict, pf: dict | None) -> dict:
    revenus = fin.get("revenus_mensuels") or []
    charges = fin.get("charges_mensuelles") or []
    invest = fin.get("flux_investissement_mensuels") or []
    finance = fin.get("flux_financement_mensuels") or []
    actifs = list(fin.get("actifs") or [])
    passifs = fin.get("passifs") or []

    # 1. Compte de résultat mensuel (income statement)
    rev_actifs = _somme([r for r in revenus if r.get("type", "actif") == "actif"])
    rev_passifs = _somme([r for r in revenus if r.get("type") == "passif"])
    rev_total = round(rev_actifs + rev_passifs, 2)
    ch_fixes = _somme([c for c in charges if c.get("nature", "fixe") == "fixe"])
    ch_var = _somme([c for c in charges if c.get("nature") == "variable"])
    ch_total = round(ch_fixes + ch_var, 2)
    interets = round(sum(float(p.get("capital_restant") or 0) * float(p.get("taux") or 0) / 100 / 12 for p in passifs), 2)
    resultat = round(rev_total - ch_total - interets, 2)
    compte_resultat = {
        "revenus_activite": rev_actifs, "revenus_passifs": rev_passifs, "revenus_total": rev_total,
        "charges_fixes": ch_fixes, "charges_variables": ch_var, "charges_total": ch_total,
        "marge_sur_charges_variables": round(rev_total - ch_var, 2),
        "excedent_brut": round(rev_total - ch_total, 2),  # ≈ EBE du ménage
        "charges_financieres": interets,
        "resultat_net": resultat,  # = capacité d'épargne
        "detail_revenus": revenus, "detail_charges": charges,
    }

    # 2. Tableau des flux de trésorerie (cash flow statement)
    cf_op = round(rev_total - ch_total, 2)
    cf_inv = -_somme(invest)
    cf_fin = _somme(finance)  # remboursements en négatif, nouveaux emprunts en positif
    fcf = round(cf_op + cf_fin, 2)  # free cash flow perso : ce qui reste après service de la dette
    flux = {
        "flux_operationnels": cf_op, "flux_investissement": cf_inv, "flux_financement": cf_fin,
        "free_cash_flow": fcf, "variation_tresorerie": round(cf_op + cf_inv + cf_fin, 2),
        "detail_investissement": invest, "detail_financement": finance,
    }

    # 3. Bilan (balance sheet) — le portefeuille boursier est valorisé au marché automatiquement
    if pf and pf.get("total_eur"):
        actifs.append({"poste": "Portefeuille boursier (valeur de marché)", "montant": pf["total_eur"], "categorie": "placements"})
    cats = {}
    for a in actifs:
        c = a.get("categorie", "autres")
        cats[c] = round(cats.get(c, 0) + float(a.get("montant") or 0), 2)
    actif_total = round(sum(cats.values()), 2)
    passif_total = _somme(passifs, "capital_restant")
    patrimoine_net = round(actif_total - passif_total, 2)
    bilan = {"actifs": actifs, "actifs_par_categorie": cats, "actif_total": actif_total,
             "passifs": passifs, "passif_total": passif_total, "patrimoine_net": patrimoine_net}

    # 4. Ratios
    liquide = cats.get("liquidites", 0) + cats.get("epargne_precaution", 0)
    investi = cats.get("placements", 0) + cats.get("immobilier", 0)
    mensualites = _somme(passifs, "mensualite")
    fire = round(ch_total * 12 * 25, 2)  # règle des 4 % : 25 années de dépenses
    ratios = [
        _r("taux_epargne", "Taux d'épargne", _ratio(resultat, rev_total), "%", 20, 10, True,
           "Résultat net ÷ revenus totaux. Part de chaque euro gagné qui n'est pas consommée."),
        _r("reserve_liquidite", "Réserve de liquidité", round(liquide / ch_total, 1) if ch_total else None, "mois", 6, 3, True,
           "(Liquidités + épargne de précaution) ÷ charges mensuelles. Nombre de mois tenables sans revenu."),
        _r("taux_effort", "Taux d'effort (endettement)", _ratio(mensualites, rev_total), "%", 15, 35, False,
           "Mensualités de crédit ÷ revenus. Le HCSF plafonne à 35 % pour un crédit immobilier."),
        _r("levier", "Ratio d'endettement (dettes ÷ actifs)", _ratio(passif_total, actif_total), "%", 20, 50, False,
           "Part des actifs financée par la dette. Mesure le levier du bilan."),
        _r("couverture_passive", "Couverture des charges par revenus passifs", _ratio(rev_passifs, ch_total), "%", 10, 0, True,
           "Revenus passifs ÷ charges. À 100 %, tu es financièrement indépendant. Objectif de long terme : jamais « critique », seulement à construire."),
        _r("part_investie", "Part des actifs investie", _ratio(investi, actif_total), "%", 50, 20, True,
           "Placements ÷ actif total. Trop de cash dort et perd contre l'inflation ; trop peu fragilise."),
        _r("progression_fire", "Progression vers l'indépendance financière", _ratio(investi, fire), "%", 25, 0, True,
           "Actifs investis ÷ (charges annuelles × 25). Le « nombre FIRE » repose sur un retrait de 4 %/an. Objectif de long terme."),
    ]
    return {"compte_resultat": compte_resultat, "flux": flux, "bilan": bilan, "ratios": ratios,
            "nombre_fire": fire, "epargne_mensuelle_investie": _somme(invest)}


def _r(code, nom, valeur, unite, bon, alerte, plus_haut_mieux, definition):
    """Statut good / warning / critical selon deux seuils (le sens dépend du ratio)."""
    if valeur is None:
        statut = "na"
    elif plus_haut_mieux:
        statut = "good" if valeur >= bon else ("warning" if valeur >= alerte else "critical")
    else:
        statut = "good" if valeur <= bon else ("warning" if valeur <= alerte else "critical")
    return {"code": code, "nom": nom, "valeur": valeur, "unite": unite, "statut": statut,
            "seuil_bon": bon, "seuil_alerte": alerte, "plus_haut_mieux": plus_haut_mieux, "definition": definition}


# ─── Projection ───────────────────────────────────────────────────────────────

def projection(patrimoine: float, epargne_mensuelle: float, annees: int = 15) -> dict:
    """Patrimoine projeté à 3 rendements annuels nets d'inflation (hypothèses, pas des promesses)."""
    scen = {"Prudent 2 %": 0.02, "Central 4 %": 0.04, "Dynamique 6 %": 0.06}
    an0 = date.today().year
    out = {"annees": [str(an0 + i) for i in range(annees + 1)], "series": []}
    for k, (nom, r) in enumerate(scen.items(), start=1):
        v, pts = patrimoine, [round(patrimoine)]
        for _ in range(annees):
            for _m in range(12):
                v = v * (1 + r) ** (1 / 12) + epargne_mensuelle
            pts.append(round(v))
        out["series"].append({"nom": nom, "valeurs": pts, "slot": k})
    return out


# ─── Gamification ─────────────────────────────────────────────────────────────

NIVEAUX = [(0, "Apprenti"), (1, "Épargnant"), (5, "Investisseur"), (10, "Stratège"),
           (25, "Rentier partiel"), (50, "Quasi-libre"), (100, "Indépendant")]


def gamification(ef: dict, pf: dict | None, fin: dict) -> dict:
    R = {r["code"]: r["valeur"] for r in ef["ratios"]}
    te, res, eff = R.get("taux_epargne") or 0, R.get("reserve_liquidite") or 0, R.get("taux_effort") or 0
    fire = R.get("progression_fire") or 0
    nb_lignes = len([l for l in (pf or {}).get("lignes", []) if not l.get("indisponible")])
    depassements = len((pf or {}).get("alertes_regles", []))
    dette_conso = any(p.get("type") == "conso" for p in ef["bilan"]["passifs"])
    net = ef["bilan"]["patrimoine_net"]

    # Score de santé financière /100 : 5 piliers de 20 points
    piliers = [
        {"nom": "Épargne", "pts": round(min(20, te / 25 * 20), 1), "detail": f"taux d'épargne {te} % (20/20 à 25 %)"},
        {"nom": "Sécurité", "pts": round(min(20, res / 6 * 20), 1), "detail": f"réserve {res} mois (20/20 à 6 mois)"},
        {"nom": "Dette", "pts": round(max(0, 20 - max(0, eff - 10) * 0.8) - (8 if dette_conso else 0), 1),
         "detail": f"taux d'effort {eff} %" + (" · crédit conso présent" if dette_conso else "")},
        {"nom": "Investissement", "pts": round(min(20, (R.get("part_investie") or 0) / 50 * 20), 1),
         "detail": f"{R.get('part_investie') or 0} % des actifs investis (20/20 à 50 %)"},
        {"nom": "Discipline", "pts": max(0, 20 - 6 * depassements - (8 if ef["epargne_mensuelle_investie"] <= 0 else 0)),
         "detail": f"{depassements} règle(s) violée(s)" + ("" if ef["epargne_mensuelle_investie"] > 0 else " · aucun versement programmé")},
    ]
    for p in piliers:
        p["pts"] = max(0, min(20, p["pts"]))
    score = round(sum(p["pts"] for p in piliers))

    # Niveau = progression vers l'indépendance financière
    idx = max(i for i, (seuil, _) in enumerate(NIVEAUX) if fire >= seuil)
    bas = NIVEAUX[idx][0]
    haut = NIVEAUX[idx + 1][0] if idx + 1 < len(NIVEAUX) else bas
    xp = 100 if haut == bas else round((fire - bas) / (haut - bas) * 100)

    # Badges (débloqués ou progression)
    def badge(nom, desc, prog):
        return {"nom": nom, "desc": desc, "progression": max(0, min(100, round(prog))), "obtenu": prog >= 100}
    badges = [
        badge("Coussin de sécurité", "3 mois de charges en réserve", res / 3 * 100),
        badge("Forteresse", "6 mois de charges en réserve", res / 6 * 100),
        badge("Épargnant d'élite", "Taux d'épargne ≥ 25 %", te / 25 * 100),
        badge("Premier pas en bourse", "Au moins une ligne en portefeuille", 100 if nb_lignes else 0),
        badge("Diversifié et discipliné", "≥ 3 lignes et aucune action > 5 %", (min(nb_lignes, 3) / 3 * 100) if not depassements else 50),
        badge("Zéro crédit conso", "Aucun crédit à la consommation", 0 if dette_conso else 100),
        badge("Rente symbolique", "50 € de revenus passifs / mois", ef["compte_resultat"]["revenus_passifs"] / 50 * 100),
        badge("Cap des 10 000 €", "Patrimoine net ≥ 10 000 €", net / 10_000 * 100),
        badge("Club des 100 000 €", "Patrimoine net ≥ 100 000 €", net / 100_000 * 100),
    ]

    # Série : mois consécutifs de hausse du patrimoine (relevés manuels dans finances.yml)
    hist = fin.get("historique_patrimoine") or []
    serie = 0
    for a, b in zip(reversed(hist[:-1]), reversed(hist[1:])):
        if b["patrimoine_net"] > a["patrimoine_net"]:
            serie += 1
        else:
            break

    # Missions calculées (l'IA en ajoute de plus qualitatives)
    ch = ef["compte_resultat"]["charges_total"]
    missions = []
    if res < 3:
        missions.append(f"Monter la réserve de liquidité à 3 mois : il manque {round((3 - res) * ch):,} €.".replace(",", " "))
    if te < 20 and ef["compte_resultat"]["revenus_total"]:
        gap = round((0.20 - te / 100) * ef["compte_resultat"]["revenus_total"])
        missions.append(f"Passer le taux d'épargne à 20 % : {gap} € de charges à couper ou de revenus à créer par mois.")
    for a in (pf or {}).get("alertes_regles", []):
        missions.append(f"Respecter ta règle de concentration : {a}.")
    if ef["epargne_mensuelle_investie"] <= 0:
        missions.append("Programmer un versement mensuel automatique (DCA), même 50 €. La régularité bat le timing.")

    return {"score": score, "piliers": piliers, "niveau": idx + 1, "titre_niveau": NIVEAUX[idx][1],
            "prochain_niveau": NIVEAUX[idx + 1][1] if idx + 1 < len(NIVEAUX) else None,
            "seuil_prochain": haut, "xp_pct": xp, "badges": badges, "serie_mois": serie,
            "missions_calculees": missions}


# ─── Chiffrement ──────────────────────────────────────────────────────────────

def chiffrer(payload: dict, phrase: str) -> dict:
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

    sel, iv = os.urandom(16), os.urandom(12)
    cle = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=sel, iterations=PBKDF2_ITERATIONS).derive(phrase.encode())
    ct = AESGCM(cle).encrypt(iv, json.dumps(payload, ensure_ascii=False).encode(), None)
    b64 = lambda b: base64.b64encode(b).decode()
    return {"v": 1, "kdf": "PBKDF2-SHA256", "iter": PBKDF2_ITERATIONS, "sel": b64(sel), "iv": b64(iv), "ct": b64(ct)}


def dechiffrer(blob: dict, phrase: str) -> dict:
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

    d = lambda k: base64.b64decode(blob[k])
    cle = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=d("sel"), iterations=blob["iter"]).derive(phrase.encode())
    return json.loads(AESGCM(cle).decrypt(d("iv"), d("ct"), None))
