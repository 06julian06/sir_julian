"""Moteur « abonnement » : fait tourner l'IA avec l'abonnement Claude existant (Pro, Max, Team…),
via Claude Code en ligne de commande et le jeton CLAUDE_CODE_OAUTH_TOKEN (généré par
`claude setup-token`). Aucun coût d'API en plus : la consommation compte dans les limites
de l'abonnement.

Il imite la petite partie de la réponse de l'API que le reste du code utilise
(blocs `text` et `web_search_tool_result`, `stop_reason`), si bien que brain.py et savoir.py
n'ont pas à savoir quel moteur tourne.
"""
from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace as NS

log = logging.getLogger(__name__)

NOTES_SCHEMA = {
    "type": "object",
    "properties": {
        "notes": {"type": "string", "description": "Notes de travail détaillées, chaque fait suivi de son URL source."},
        "urls": {"type": "array", "items": {"type": "string"}, "description": "TOUTES les URL réellement consultées, exactes."},
    },
    "required": ["notes", "urls"],
}


def disponible() -> bool:
    return bool(os.environ.get("CLAUDE_CODE_OAUTH_TOKEN")) and shutil.which("claude") is not None


def _texte_messages(messages: list[dict]) -> str:
    morceaux = []
    for m in messages:
        c = m["content"]
        if isinstance(c, str):
            morceaux.append(c)
        else:
            morceaux += [b.get("text", "") for b in c if isinstance(b, dict)]
    return "\n\n".join(x for x in morceaux if x)


def _cli(system: str, prompt: str, schema: dict | None, web: bool, model: str | None) -> dict:
    cmd = ["claude", "-p", "--output-format", "json", "--no-session-persistence",
           "--append-system-prompt", system, "--max-turns", "40" if web else "8"]
    if web:
        cmd += ["--tools", "WebSearch,WebFetch", "--allowedTools", "WebSearch", "WebFetch"]
    else:
        cmd += ["--tools", ""]
    if schema:
        cmd += ["--json-schema", json.dumps(schema, ensure_ascii=False)]
    if model:
        cmd += ["--model", model]
    r = subprocess.run(cmd, input=prompt, capture_output=True, text=True, timeout=1500, env=os.environ.copy())
    try:
        res = json.loads(r.stdout.strip().splitlines()[-1]) if r.stdout.strip() else {}
    except json.JSONDecodeError:
        res = {}
    if r.returncode != 0 or res.get("is_error") or res.get("subtype") not in (None, "success"):
        detail = res.get("result") or " ".join(res.get("errors") or []) or r.stderr or r.stdout
        raise RuntimeError(f"Claude Code a échoué (code {r.returncode}) : {str(detail)[:400]}. "
                           "Vérifie le secret CLAUDE_CODE_OAUTH_TOKEN (à régénérer avec « claude setup-token »).")
    return res


def _url_existe(u: str) -> bool:
    """Garde-fou : une source citée doit au moins exister (les sites qui bloquent les robots comptent comme existants)."""
    if not u.startswith(("http://", "https://")):
        return False
    for methode in ("HEAD", "GET"):
        try:
            req = urllib.request.Request(u, method=methode, headers={"User-Agent": "Mozilla/5.0 (compatible; veille-finance/1.0)"})
            with urllib.request.urlopen(req, timeout=12) as rep:
                return rep.status < 400
        except urllib.error.HTTPError as e:
            if e.code in (401, 403, 405, 429, 451, 999):
                return True
            if methode == "GET" or e.code in (404, 410):
                return e.code not in (404, 410)
        except Exception:
            if methode == "GET":
                return False
    return False


def verifier_urls(urls: list[str]) -> set[str]:
    urls = list(dict.fromkeys(u.strip() for u in urls if u and u.strip()))[:60]
    with ThreadPoolExecutor(max_workers=8) as ex:
        ok = {u for u, v in zip(urls, ex.map(_url_existe, urls)) if v}
    if len(ok) < len(urls):
        log.warning("%d URL citée(s) introuvable(s), écartée(s)", len(urls) - len(ok))
    return ok


def message(model: str | None = None, system: str = "", messages: list | None = None, tools: list | None = None,
            output_config: dict | None = None, **_ignore):
    """Équivalent minimal de client.beta.messages.stream(...).get_final_message()."""
    prompt = _texte_messages(messages or [])
    web = any(t.get("name") == "web_search" for t in (tools or []))
    fmt = (output_config or {}).get("format") or {}
    choisi = os.environ.get("VEILLE_MODEL_ABONNEMENT") or None  # par défaut : le modèle de l'abonnement
    if web:
        res = _cli(system, prompt + "\n\nUtilise la recherche web. Renvoie tes notes et la liste exacte des URL consultées.",
                   NOTES_SCHEMA, True, choisi)
        so = res.get("structured_output") or {}
        urls = verifier_urls(so.get("urls", []))
        blocs = [NS(type="web_search_tool_result", content=[NS(url=u) for u in sorted(urls)]),
                 NS(type="text", text=so.get("notes", res.get("result", "")))]
    elif fmt.get("type") == "json_schema":
        res = _cli(system, prompt, fmt["schema"], False, choisi)
        so = res.get("structured_output")
        if so is None:
            raise RuntimeError("Claude Code n'a pas renvoyé de sortie structurée")
        blocs = [NS(type="text", text=json.dumps(so, ensure_ascii=False))]
    else:
        res = _cli(system, prompt, None, False, choisi)
        blocs = [NS(type="text", text=res.get("result", ""))]
    return NS(content=blocs, stop_reason="end_turn", stop_details=None)
