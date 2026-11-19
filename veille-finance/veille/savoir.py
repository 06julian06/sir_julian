"""Apprendre : cours du lundi (Académie), décryptages d'actualité, réponses aux questions.

Même discipline que les éditions : 1) recherche web sourcée, 2) rédaction en JSON contraint,
3) toute URL non vue pendant la recherche est retirée (garde-fou anti-invention).
"""
from __future__ import annotations

import json
import logging

from .brain import MODEL, RADAR_MODEL, _stream, _text

log = logging.getLogger(__name__)

WEB = lambda n: {"type": "web_search_20260209", "name": "web_search", "max_uses": n,
                 "user_location": {"type": "approximate", "country": "FR", "timezone": "Europe/Paris"}}


def chercher(system: str, consigne: str, max_uses: int = 6, effort: str = "medium", model: str = MODEL) -> tuple[str, set[str]]:
    messages = [{"role": "user", "content": consigne + "\n\nÉtape RECHERCHE : rends des notes de travail, chaque fait suivi de son URL source exacte."}]
    urls, notes = set(), []
    for _ in range(4):
        msg = _stream(model=model, max_tokens=24000, system=system, messages=messages, tools=[WEB(max_uses)],
                      thinking={"type": "adaptive"}, output_config={"effort": effort})
        for b in msg.content:
            if b.type == "web_search_tool_result" and isinstance(b.content, list):
                urls.update(r.url for r in b.content if getattr(r, "url", None))
        notes.append(_text(msg))
        if msg.stop_reason != "pause_turn":
            break
        messages = messages + [{"role": "assistant", "content": msg.content}]
    return "\n".join(notes), urls


def rediger(system: str, contenu: str, schema: dict, effort: str = "high", model: str = MODEL, max_tokens: int = 32000) -> dict:
    msg = _stream(model=model, max_tokens=max_tokens, system=system, messages=[{"role": "user", "content": contenu}],
                  thinking={"type": "adaptive"}, output_config={"effort": effort, "format": {"type": "json_schema", "schema": schema}})
    return json.loads(_text(msg))


def filtrer_sources(sources: list[dict], urls: set[str]) -> list[dict]:
    ok = [s for s in sources if s.get("url") in urls]
    if len(ok) < len(sources):
        log.warning("%d source(s) non vérifiée(s) retirée(s)", len(sources) - len(ok))
    return ok


S = lambda **p: {"type": "string", **p}
SOURCES = {"type": "array", "items": {"type": "object", "properties": {"nom": S(), "url": S()},
                                      "required": ["nom", "url"], "additionalProperties": False}}
TERMES = {"type": "array", "description": "Termes techniques employés, expliqués simplement (ils enrichissent le lexique).",
          "items": {"type": "object", "properties": {
              "terme": S(), "categorie": S(enum=["comptes", "valorisation", "marches", "macro", "produits", "regulation", "portefeuille"]),
              "definition": S(description="Une à deux phrases, sans jargon."), "formule": S(description="Formule si pertinent, sinon vide"),
              "exemple": S(description="Exemple chiffré simple, sinon vide")},
              "required": ["terme", "categorie", "definition", "formule", "exemple"], "additionalProperties": False}}


# ─── 1. Cours du lundi ────────────────────────────────────────────────────────

COURS_SCHEMA = {
    "type": "object",
    "properties": {
        "titre": S(), "accroche": S(description="Pourquoi ce cours compte, en une phrase."),
        "rappel": S(description="Lien explicite avec les cours précédents (2-3 phrases). Vide pour le tout premier cours."),
        "objectifs": {"type": "array", "items": S(), "description": "3 à 5 objectifs : « À la fin, tu sauras... »"},
        "sections": {"type": "array", "items": {"type": "object", "properties": {
            "titre": S(), "contenu": S(description="Explication claire et rigoureuse, markdown léger (**gras**, listes). 150 à 400 mots.")},
            "required": ["titre", "contenu"], "additionalProperties": False}},
        "exemple": {"type": "object", "description": "Exemple chiffré résolu pas à pas.", "properties": {
            "enonce": S(), "etapes": {"type": "array", "items": S()}, "resultat": S()},
            "required": ["enonce", "etapes", "resultat"], "additionalProperties": False},
        "cas_reel": {"type": "object", "description": "Application à une entreprise ou une actualité RÉELLE et récente, chiffres sourcés.", "properties": {
            "titre": S(), "explication": S(), "source_nom": S(), "source_url": S()},
            "required": ["titre", "explication", "source_nom", "source_url"], "additionalProperties": False},
        "exercice": {"type": "object", "properties": {
            "enonce": S(), "questions": {"type": "array", "items": S()}, "corrige": S(description="Corrigé détaillé, calculs inclus.")},
            "required": ["enonce", "questions", "corrige"], "additionalProperties": False},
        "quiz": {"type": "array", "description": "5 questions à choix multiple.", "items": {"type": "object", "properties": {
            "question": S(), "choix": {"type": "array", "items": S()}, "bonne_reponse": {"type": "integer", "description": "Index (0-based) du bon choix"},
            "explication": S()}, "required": ["question", "choix", "bonne_reponse", "explication"], "additionalProperties": False}},
        "a_retenir": {"type": "array", "items": S(), "description": "4 à 6 points essentiels."},
        "angle_pro": S(description="Ce qu'un professionnel de la finance réglementée doit en retenir, ou comment la notion tombe en entretien."),
        "termes": TERMES,
        "pour_aller_plus_loin": SOURCES,
    },
    "required": ["titre", "accroche", "rappel", "objectifs", "sections", "exemple", "cas_reel", "exercice", "quiz", "a_retenir",
                 "angle_pro", "termes", "pour_aller_plus_loin"],
    "additionalProperties": False,
}


def cours(system: str, numero: int, module: str, semaine: dict, precedents: list[dict]) -> dict:
    histo = "\n".join(f"- Cours {p['numero']} « {p['titre']} » : " + " / ".join(p.get("a_retenir", [])[:4]) for p in precedents[-12:]) or "(premier cours)"
    sujet = f"""Cours n°{numero} de l'Académie — module « {module} ».
Sujet : {semaine['titre']}
Notions à couvrir : {", ".join(semaine.get('notions', []))}

Cours déjà suivis (s'appuyer dessus, ne pas les répéter) :
{histo}"""
    notes, urls = chercher(system, sujet + "\n\nTrouve : un cas réel récent (entreprise cotée, de préférence présente dans un ETF Monde ou Europe, ou actualité de marché) avec ses chiffres officiels, et 2-3 ressources de référence (AMF, Banque de France, BCE, rapports annuels, Investopedia, etc.).", max_uses=6)
    c = rediger(system, f"""{sujet}

NOTES DE RECHERCHE :
{notes}

Rédige le cours complet. Niveau : quelqu'un d'intelligent qui progresse vite, pas de condescendance.
Explique chaque terme technique à sa première apparition. Exemple chiffré résolu, cas réel sourcé
(chiffres uniquement issus des notes), exercice pratique avec corrigé, quiz de 5 questions.
source_url et pour_aller_plus_loin : uniquement des URL présentes dans les notes.""", COURS_SCHEMA)
    c["pour_aller_plus_loin"] = filtrer_sources(c["pour_aller_plus_loin"], urls)
    if c["cas_reel"]["source_url"] not in urls:
        c["cas_reel"]["source_url"], c["cas_reel"]["non_verifie"] = "", True
    return c


# ─── 2. Décryptage d'une actualité majeure ────────────────────────────────────

DECRYPTAGE_SCHEMA = {
    "type": "object",
    "properties": {
        "titre": S(description="Titre explicatif, ex. « Départ du PDG de Nvidia : ce que ça change »"),
        "chapo": S(description="L'essentiel en 2 phrases."),
        "faits": S(description="Ce qui s'est passé, daté et sourcé."),
        "ce_que_ca_veut_dire": S(description="Le mécanisme : pourquoi le marché réagit, quels termes comprendre. Markdown léger."),
        "qui_est_concerne": S(description="Secteurs, entreprises, pays, ETF concernés."),
        "attendus": S(description="Ce qu'il faut surveiller ensuite : dates, chiffres attendus, scénarios."),
        "pour_toi": S(description="Ce que ça change pour ce profil précis (PEA, DCA, ETF Monde). Souvent : rien à faire, et pourquoi."),
        "termes": TERMES, "sources": SOURCES,
    },
    "required": ["titre", "chapo", "faits", "ce_que_ca_veut_dire", "qui_est_concerne", "attendus", "pour_toi", "termes", "sources"],
    "additionalProperties": False,
}


def decrypter(system: str, item: dict) -> dict:
    sujet = f"Actualité à décrypter : « {item['titre']} » ({item['source']}, {item['date']}) — {item['url']}\n{item.get('resume', '')}"
    notes, urls = chercher(system, sujet + "\n\nVérifie les faits auprès de sources fiables, trouve le contexte, les chiffres et les prochaines échéances.",
                           max_uses=4, model=RADAR_MODEL)
    urls.add(item["url"])
    d = rediger(system, f"{sujet}\n\nNOTES :\n{notes}\n\nRédige le décryptage. Faits uniquement issus des notes. Sources : uniquement des URL présentes dans les notes.",
                DECRYPTAGE_SCHEMA, effort="medium", model=RADAR_MODEL, max_tokens=16000)
    d["sources"] = filtrer_sources(d["sources"], urls) or [{"nom": item["source"], "url": item["url"]}]
    return d


# ─── 3. Réponse à une question ────────────────────────────────────────────────

REPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "titre": S(description="La question reformulée clairement."),
        "reponse_courte": S(description="La réponse en 2-3 phrases."),
        "explication": S(description="Explication complète, mécanismes, exemple chiffré. Markdown léger."),
        "pour_toi": S(description="Application à ce profil, ou vide."),
        "termes": TERMES, "sources": SOURCES,
    },
    "required": ["titre", "reponse_courte", "explication", "pour_toi", "termes", "sources"],
    "additionalProperties": False,
}


def repondre(system: str, question: dict) -> dict:
    sujet = f"Question posée : {question['titre']}\n{question.get('texte', '')}"
    notes, urls = chercher(system, sujet + "\n\nCherche les informations nécessaires pour répondre de façon exacte et à jour.", max_uses=5)
    r = rediger(system, f"{sujet}\n\nNOTES :\n{notes}\n\nRéponds. Si la question est mal posée, corrige-la. Sources : uniquement des URL présentes dans les notes.",
                REPONSE_SCHEMA, effort="medium", max_tokens=16000)
    r["sources"] = filtrer_sources(r["sources"], urls)
    return r
