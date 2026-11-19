"""Envoi de la newsletter. Deux fournisseurs au choix, configurés par variables d'environnement.

SMTP (par défaut — fonctionne avec Gmail, Outlook, OVH, etc.) :
  SMTP_HOST, SMTP_PORT (465 = SSL, 587 = STARTTLS), SMTP_USER, SMTP_PASSWORD,
  NEWSLETTER_FROM (optionnel, défaut = SMTP_USER), NEWSLETTER_TO (liste séparée par virgules)

Buttondown (si tu veux un formulaire d'inscription public et la gestion des désinscriptions) :
  NEWSLETTER_PROVIDER=buttondown, BUTTONDOWN_API_KEY
"""
from __future__ import annotations

import json
import logging
import os
import smtplib
import ssl
import urllib.request
from email.message import EmailMessage

log = logging.getLogger(__name__)


def send(subject: str, html: str, text_fallback: str) -> bool:
    provider = os.environ.get("NEWSLETTER_PROVIDER", "smtp").lower()
    try:
        if provider == "buttondown":
            return _buttondown(subject, html)
        return _smtp(subject, html, text_fallback)
    except Exception as e:  # l'échec d'envoi ne doit pas empêcher la publication du site
        log.error("Envoi newsletter échoué (%s) : %s", provider, e)
        return False


def _smtp(subject: str, html: str, text: str) -> bool:
    host, user, pwd = os.environ.get("SMTP_HOST"), os.environ.get("SMTP_USER"), os.environ.get("SMTP_PASSWORD")
    to = [x.strip() for x in os.environ.get("NEWSLETTER_TO", "").split(",") if x.strip()]
    if not (host and user and pwd and to):
        log.warning("SMTP non configuré : newsletter non envoyée (le site est quand même publié).")
        return False
    port = int(os.environ.get("SMTP_PORT") or "465")
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = os.environ.get("NEWSLETTER_FROM") or user
    msg["To"] = msg["From"]
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")
    ctx = ssl.create_default_context()
    if port == 465:
        with smtplib.SMTP_SSL(host, port, context=ctx, timeout=60) as s:
            s.login(user, pwd)
            s.send_message(msg, to_addrs=to)  # destinataires en copie cachée
    else:
        with smtplib.SMTP(host, port, timeout=60) as s:
            s.starttls(context=ctx)
            s.login(user, pwd)
            s.send_message(msg, to_addrs=to)
    log.info("Newsletter envoyée à %d destinataire(s)", len(to))
    return True


def _buttondown(subject: str, html: str) -> bool:
    key = os.environ.get("BUTTONDOWN_API_KEY")
    if not key:
        log.warning("BUTTONDOWN_API_KEY absent : newsletter non envoyée.")
        return False
    body = json.dumps({"subject": subject, "body": html, "status": "about_to_send"}).encode()
    req = urllib.request.Request("https://api.buttondown.com/v1/emails", data=body, method="POST",
                                 headers={"Authorization": f"Token {key}", "Content-Type": "application/json",
                                          "X-Buttondown-Live-Dangerously": "true"})
    with urllib.request.urlopen(req, timeout=60) as r:
        ok = 200 <= r.status < 300
    log.info("Buttondown : %s", "envoyé" if ok else "échec")
    return ok
