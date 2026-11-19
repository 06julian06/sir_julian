"""Le "cerveau" : Claude lit la collecte, cherche sur le web, puis rédige l'édition.

Deux appels distincts, volontairement :
  1. RECHERCHE  — web search activé, sortie libre (notes + URLs).
  2. RÉDACTION  — aucun outil, sortie JSON contrainte par schéma (output_config).
Séparer les deux évite de mélanger citations web et JSON strict, et rend chaque
étape vérifiable.
"""
from __future__ import annotations

import json
import logging
import os

import anthropic
import yaml

log = logging.getLogger(__name__)

MODEL = os.environ.get("VEILLE_MODEL") or "claude-opus-5-5"
# Le tri du fil continu (8 fois par jour) peut tourner sur un modèle moins cher si tu le décides.
RADAR_MODEL = os.environ.get("VEILLE_MODEL_RADAR") or MODEL
BETAS = ["server-side-fallback-2026-07-01"]
# Si une requête est refusée par un classifieur de sécurité (faux positif possible
# sur des sujets de fraude financière), l'API la rejoue sur un modèle de repli.
FALLBACKS = "default"

_client: anthropic.Anthropic | None = None


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic()  # lit ANTHROPIC_API_KEY
    return _client


# ─── Prompts ──────────────────────────────────────────────────────────────────

def system_prompt(profil: dict, structure: dict) -> str:
    return f"""Tu es l'analyste et mentor financier personnel d'une seule personne.
Tu tiens pour elle une veille financière automatique, 24h/24, publiée sur un site
et envoyée par newsletter. Personne ne relit avant publication : la rigueur est
donc ta responsabilité.

PROFIL DE LA PERSONNE (adapte tout à ce profil ; les champs "A_COMPLETER" sont
des hypothèses non confirmées — ne les présente jamais comme des faits) :
{yaml.safe_dump(profil, allow_unicode=True, sort_keys=False)}

STRUCTURE ÉDITORIALE À RESPECTER :
{yaml.safe_dump(structure, allow_unicode=True, sort_keys=False)}

RÈGLES DE FOND
- Exactitude d'abord. Chaque fait daté et chiffré doit venir d'une source fournie
  ou trouvée par recherche. Si tu n'as pas de source, tu ne l'affirmes pas.
- Distingue toujours le fait, l'interprétation, et l'incertitude.
- Pas de sensationnalisme, pas de prédiction de cours présentée comme certaine.
- Tu analyses ; tu ne donnes pas d'ordre d'achat/vente sur un titre précis. Le
  contenu est informatif (pas un conseil en investissement au sens de l'article
  L.541-1 du Code monétaire et financier).
- Ton : direct, exigeant, zéro flatterie, en français. Explique les mécanismes.
- Si rien d'important ne s'est passé, dis-le. "Rien à faire" est une réponse valable."""


def _stream(model: str = MODEL, **kwargs):
    with _get_client().beta.messages.stream(model=model, betas=BETAS, fallbacks=FALLBACKS, **kwargs) as s:
        msg = s.get_final_message()
    if msg.stop_reason == "refusal":
        raise RuntimeError(f"Requête refusée : {msg.stop_details}")
    return msg


def _text(msg) -> str:
    return "".join(b.text for b in msg.content if b.type == "text")


# ─── 1. Recherche ─────────────────────────────────────────────────────────────

def research(system: str, contexte: str, mode: str) -> tuple[str, set[str]]:
    """Appel avec recherche web. Retourne (notes, ensemble des URLs consultées)."""
    consigne = {
        "quotidien": "Prépare l'édition du jour.",
        "hebdo": "Prépare l'édition HEBDOMADAIRE : bilan des 7 derniers jours, tendances de fond, ce qu'il faut retenir et préparer pour la semaine à venir.",
    }[mode]
    messages = [{
        "role": "user",
        "content": f"""{consigne}

{contexte}

Étape RECHERCHE uniquement. Lis la collecte ci-dessus, puis utilise la recherche web
pour : (a) vérifier/compléter les 4-6 sujets les plus importants, (b) trouver les
publications réglementaires récentes (AMF, ACPR, ESMA, EBA, BCE, Commission
européenne), (c) l'agenda économique des 7 prochains jours (BCE, Fed, inflation,
emploi, résultats majeurs), (d) les nouveautés produits/fiscalité épargne en France,
(e) l'actualité des lignes du portefeuille s'il y en a, (f) pour le Deep Dive :
choisis l'entreprise et collecte ses chiffres récents (derniers résultats, free cash
flow, dette, valorisation) depuis des sources fiables.

Rends des NOTES DE TRAVAIL structurées par rubrique, chaque fait suivi de son URL
source exacte. Pas de rédaction finale à ce stade.""",
    }]
    tools = [{
        "type": "web_search_20260209",
        "name": "web_search",
        "max_uses": 10 if mode == "quotidien" else 15,
        "user_location": {"type": "approximate", "country": "FR", "timezone": "Europe/Paris"},
    }]
    urls: set[str] = set()
    notes = []
    for _ in range(5):  # boucle pause_turn : la recherche serveur peut rendre la main en cours de route
        msg = _stream(
            max_tokens=32000,
            system=system,
            messages=messages,
            tools=tools,
            thinking={"type": "adaptive"},
            output_config={"effort": "high"},
        )
        for b in msg.content:
            if b.type == "web_search_tool_result" and isinstance(b.content, list):
                urls.update(r.url for r in b.content if getattr(r, "url", None))
        notes.append(_text(msg))
        if msg.stop_reason != "pause_turn":
            break
        messages = messages + [{"role": "assistant", "content": msg.content}]
    log.info("Recherche terminée : %d URLs consultées", len(urls))
    return "\n".join(notes), urls


# ─── 2. Rédaction structurée ──────────────────────────────────────────────────

ITEM = {
    "type": "object",
    "properties": {
        "titre": {"type": "string"},
        "texte": {"type": "string", "description": "Corps de l'élément, 2 à 8 phrases. Markdown léger autorisé (**gras**)."},
        "pourquoi": {"type": "string", "description": "Pourquoi ça compte pour CE profil, 1-2 phrases. Vide si non pertinent."},
        "source_nom": {"type": "string"},
        "source_url": {"type": "string", "description": "URL exacte issue de la collecte ou des notes. Chaîne vide si aucune."},
        "importance": {"type": "integer", "description": "1 (anecdotique) à 5 (majeur)"},
        "ref": {"type": "string", "description": "Numéro de la question traitée (rubrique questions), sinon chaîne vide."},
    },
    "required": ["titre", "texte", "pourquoi", "source_nom", "source_url", "importance", "ref"],
    "additionalProperties": False,
}

EDITION_SCHEMA = {
    "type": "object",
    "properties": {
        "titre_edition": {"type": "string", "description": "Titre accrocheur mais exact, < 90 caractères"},
        "accroche": {"type": "string", "description": "Une phrase qui résume la journée"},
        "alerte": {
            "type": "object",
            "properties": {
                "niveau": {"type": "integer", "description": "1 calme · 2 normal · 3 vigilance · 4 tension · 5 crise"},
                "message": {"type": "string"},
            },
            "required": ["niveau", "message"],
            "additionalProperties": False,
        },
        "essentiel": {"type": "array", "items": {"type": "string"}, "description": "3 points à retenir en 30 secondes"},
        "rubriques": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "titre": {"type": "string"},
                    "items": {"type": "array", "items": ITEM},
                },
                "required": ["id", "titre", "items"],
                "additionalProperties": False,
            },
        },
        "agenda": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "date": {"type": "string", "description": "AAAA-MM-JJ"},
                    "evenement": {"type": "string"},
                    "pourquoi": {"type": "string"},
                },
                "required": ["date", "evenement", "pourquoi"],
                "additionalProperties": False,
            },
        },
        "mot_du_mentor": {"type": "string", "description": "Message direct du mentor : un défi, une question dérangeante ou une action concrète pour la semaine. 2-4 phrases."},
        "graph_deep_dive": {
            "type": "object",
            "description": "Données chiffrées de l'entreprise du Deep Dive pour les graphiques.",
            "properties": {
                "entreprise": {"type": "string"},
                "symbole_stooq": {"type": "string", "description": "Code Stooq de l'action (ex : amzn.us, mc.fr), vide si inconnu"},
                "unite": {"type": "string", "description": "Unité des montants, ex : Md$ ou Md€"},
                "annees": {
                    "type": "array",
                    "description": "3 à 5 derniers exercices, du plus ancien au plus récent. UNIQUEMENT des chiffres trouvés dans les notes de recherche ; tableau vide sinon.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "annee": {"type": "string"},
                            "chiffre_affaires": {"type": "number"},
                            "free_cash_flow": {"type": "number"},
                        },
                        "required": ["annee", "chiffre_affaires", "free_cash_flow"],
                        "additionalProperties": False,
                    },
                },
                "source_nom": {"type": "string"},
                "source_url": {"type": "string"},
            },
            "required": ["entreprise", "symbole_stooq", "unite", "annees", "source_nom", "source_url"],
            "additionalProperties": False,
        },
    },
    "required": ["titre_edition", "accroche", "alerte", "essentiel", "rubriques", "agenda", "mot_du_mentor", "graph_deep_dive"],
    "additionalProperties": False,
}


def write_edition(system: str, contexte: str, notes: str, mode: str) -> dict:
    msg = _stream(
        max_tokens=48000,
        system=system,
        messages=[{
            "role": "user",
            "content": f"""{contexte}

NOTES DE RECHERCHE :
{notes}

Rédige maintenant l'édition {'hebdomadaire' if mode == 'hebdo' else 'du jour'} en JSON.
- Une entrée dans "rubriques" par rubrique de la structure, dans le même ordre,
  avec le même id et le même titre, en respectant max_items.
- source_url : uniquement une URL présente dans la collecte ou dans les notes.
- Rubrique "portefeuille" : commente les chiffres fournis sans les recalculer ni en inventer.
- Deep Dive et notion du jour : jamais un sujet de la liste "déjà traités".
- N'invente aucune date d'agenda : seulement celles trouvées dans les notes.""",
        }],
        thinking={"type": "adaptive"},
        output_config={"effort": "high", "format": {"type": "json_schema", "schema": EDITION_SCHEMA}},
    )
    return json.loads(_text(msg))


# ─── 3. Radar (fil continu, toutes les 3 h) ───────────────────────────────────

RADAR_SCHEMA = {
    "type": "object",
    "properties": {
        "selection": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "importance": {"type": "integer", "description": "1 à 5"},
                    "pourquoi": {"type": "string", "description": "Une phrase : pourquoi ça compte pour ce profil"},
                },
                "required": ["id", "importance", "pourquoi"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["selection"],
    "additionalProperties": False,
}


def triage(system: str, items: list[dict]) -> list[dict]:
    """Note rapidement les nouveaux articles. Appel léger (effort bas, sans recherche)."""
    if not items:
        return []
    listing = "\n".join(f"[{i['id']}] ({i['source']}) {i['titre']} — {i['resume'][:240]}" for i in items)
    msg = _stream(
        model=RADAR_MODEL,
        max_tokens=16000,
        system=system,
        messages=[{
            "role": "user",
            "content": f"""Nouveaux articles détectés par la veille continue.
Retourne UNIQUEMENT ceux d'importance >= 3 pour ce profil (marchés, macro, régulation,
épargne, arnaques). Importance 5 = événement qui justifie une alerte immédiate
(krach, décision surprise de banque centrale, faillite systémique, changement fiscal
majeur sur l'épargne). Sois avare du 5.

{listing}""",
        }],
        thinking={"type": "adaptive"},
        output_config={"effort": "low", "format": {"type": "json_schema", "schema": RADAR_SCHEMA}},
    )
    sel = json.loads(_text(msg))["selection"]
    by_id = {i["id"]: i for i in items}
    return [{**by_id[s["id"]], "importance": max(1, min(5, s["importance"])), "pourquoi": s["pourquoi"]}
            for s in sel if s["id"] in by_id]
