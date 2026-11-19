"""Questions posées via les Issues GitHub (label « question ») : lues avant l'édition,
répondues dans la newsletter, puis commentées et fermées automatiquement."""
from __future__ import annotations

import json
import logging
import os
import urllib.request

log = logging.getLogger(__name__)
API = "https://api.github.com"


def _call(method: str, path: str, body: dict | None = None):
    token, repo = os.environ.get("GITHUB_TOKEN"), os.environ.get("GITHUB_REPOSITORY")
    if not (token and repo):
        return None
    req = urllib.request.Request(f"{API}/repos/{repo}{path}", method=method,
                                 data=json.dumps(body).encode() if body else None,
                                 headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json",
                                          "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read() or b"null")


def fetch_open() -> list[dict]:
    try:
        issues = _call("GET", "/issues?state=open&labels=question&per_page=10") or []
    except Exception as e:
        log.warning("Lecture des questions impossible : %s", e)
        return []
    # Seules les questions du propriétaire du dépôt ou de ses collaborateurs sont prises
    # en compte : un inconnu ne doit pas pouvoir injecter du contenu dans la newsletter.
    ok = {"OWNER", "MEMBER", "COLLABORATOR"}
    return [{"numero": str(i["number"]), "titre": i["title"], "texte": (i.get("body") or "")[:2000]}
            for i in issues if "pull_request" not in i and i.get("author_association") in ok]


def answer_and_close(numero: str, reponse: str, lien: str = "") -> None:
    try:
        corps = reponse + (f"\n\n→ Édition complète : {lien}" if lien else "") + \
            "\n\n_Réponse générée automatiquement par la veille. Contenu informatif, pas un conseil en investissement._"
        _call("POST", f"/issues/{numero}/comments", {"body": corps})
        _call("PATCH", f"/issues/{numero}", {"state": "closed", "state_reason": "completed"})
        log.info("Question #%s répondue et fermée", numero)
    except Exception as e:
        log.warning("Impossible de répondre à la question #%s : %s", numero, e)
