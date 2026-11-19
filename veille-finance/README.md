# Veille Finance — site + newsletter pilotés par IA, 24h/24

Un système qui tourne seul sur GitHub Actions : il collecte l'actualité financière,
la fait analyser par Claude selon **ton profil**, publie un site (GitHub Pages) et
t'envoie une newsletter. Zéro serveur à gérer.

```
 toutes les 3 h ─► RADAR      flux RSS ─► tri IA (importance 1-5) ─► fil continu du site
                              importance 5 ─► e-mail d'alerte immédiat (max 1 / 6 h)
 chaque matin  ─► QUOTIDIEN  RSS + cotations + recherche web IA ─► édition structurée ─► site + newsletter
 le dimanche   ─► HEBDO      bilan des 7 éditions + recherche ─► édition de fond ─► site + newsletter
```

## Ce que contient chaque édition

Structure calquée sur l'émission de Fuze (« Bon... Je suis ruiné à cause de la Bourse », 18/11/2026 :
*Intro → Point sur le portefeuille → Deep Dive → Questions des abonnés → Notion du jour → Portefeuille des abonnés*),
adaptée à toi et complétée de trois rubriques orientées carrière. Tout est dans `config/structure.yml`.

| Bloc | Équivalent vidéo | Contenu |
|---|---|---|
| Niveau d'alerte + L'essentiel + Tableau de bord | Intro | Climat de marché, 3 points, cotations réelles |
| **Point sur ton portefeuille** | Point sur le portefeuille | Valorisation réelle de tes lignes, poids, perf depuis PRU, règles violées, commentaire de gérant |
| Les marchés | (contexte) | 3-6 faits sourcés + « pourquoi ça compte » |
| **Le Deep Dive** | Deep Dive : Amazon | Une entreprise : modèle, avantage, chiffres (FCF, dette, valorisation), verdict analytique — sans répétition |
| **Tes questions** | Questions des abonnés | Tes questions posées en Issues GitHub, répondues puis fermées automatiquement |
| **La notion du jour** | Notion : le free cash flow | Un concept, calcul pas à pas, piège d'interprétation — sans répétition |
| **Portefeuilles passés au crible** | Portefeuille des abonnés | Un portefeuille type disséqué : comment il mène à la ruine, comment le corriger |
| Nouveautés · Régulation & conformité · Coup d'avance | *(ajouts pour ta trajectoire)* | Produits/fiscalité, AMF/ESMA/MiCA/DORA, question d'entretien + réponse modèle |
| Agenda · Le mot du mentor | | 7 jours à venir, un défi direct |

### Ton portefeuille
`config/portefeuille.yml` — ou mieux, le **secret `PORTEFEUILLE_YAML`** (même contenu) si le dépôt est public.
Les calculs (valeur, poids, plus-values, conversion USD→EUR, règle des 5 %) sont faits en Python, jamais par l'IA.
Le site public n'affiche que des pourcentages ; les montants en euros ne vont que dans la newsletter.

### Le tableau de bord visuel (page « Portefeuille » du site)
- **Indicateurs clés** : performance depuis tes achats, dernière séance, écart sur 1 an face à ton indice de référence.
- **Courbe « ton portefeuille vs le marché »** (base 100, périodes 1M/3M/6M/1A, infobulle au survol). À composition
  actuelle constante : ce qu'aurait fait ton portefeuille d'aujourd'hui, pas l'historique réel de tes opérations.
- **Poids de chaque ligne** avec la limite des 5 % matérialisée ; dépassements en rouge.
- **Répartitions** par enveloppe, type, zone et secteur (renseigne `zone` / `secteur` dans tes positions).
- **Contributions** : quelles lignes ont fait bouger le portefeuille à la dernière séance.
- **Deep Dive** : chiffre d'affaires et free cash flow sur 4-5 ans (masqués si l'IA ne peut pas citer une source vérifiée)
  + cours sur 1 an. **Marchés** : mini-courbe 60 séances sous chaque indicateur.

Graphiques en SVG natif, sans bibliothèque externe, lisibles en mode clair et sombre, sur mobile. Palette contrôlée
pour les daltonismes. La newsletter contient une version simplifiée (barres de poids) et un lien vers le tableau de bord.

### Poser une question
*Issues → New issue → « Question pour la veille »*. Elle est traitée dans l'édition suivante, puis l'IA répond en
commentaire et ferme l'issue. Seules les questions du propriétaire et des collaborateurs du dépôt sont prises en compte
(un inconnu ne peut pas injecter de contenu dans ta newsletter).

## Garde-fous (rien n'est relu par un humain avant publication)

- **Séparation recherche / rédaction** : 1er appel avec recherche web → notes sourcées ; 2e appel sans outil → JSON validé par schéma.
- **Anti-hallucination des sources** : toute URL citée qui n'a pas été vue pendant la collecte ou la recherche est supprimée et marquée « lien non vérifié ».
- **Chiffres de marché** issus de Stooq, injectés tels quels — l'IA les commente, elle ne les produit pas.
- **Repli automatique** si une requête est bloquée par un filtre de sécurité (faux positif possible sur les sujets d'arnaque financière).
- **Robustesse** : un flux RSS mort, une cotation absente ou un échec d'e-mail n'empêchent jamais la publication.
- **Mention réglementaire** sur chaque page et chaque e-mail (contenu informatif, pas de conseil en investissement — art. L.541-1 CMF).

## Mise en service (≈ 15 minutes, une seule fois)

1. **Fusionner** cette branche dans la branche par défaut. Les déclenchements planifiés de GitHub Actions ne tournent **que** sur la branche par défaut.
2. **Clé Claude** : *Settings → Secrets and variables → Actions → New repository secret*
   `ANTHROPIC_API_KEY` = ta clé (console.anthropic.com).
3. **Newsletter (SMTP, ex. Gmail)** — secrets :
   - `SMTP_HOST` = `smtp.gmail.com`, `SMTP_PORT` = `465`
   - `SMTP_USER` = ton adresse Gmail
   - `SMTP_PASSWORD` = un **mot de passe d'application** Google (pas ton mot de passe ; nécessite la validation en 2 étapes)
   - `NEWSLETTER_TO` = destinataires séparés par des virgules (envoyés en copie cachée)
   - Alternative : variable `NEWSLETTER_PROVIDER=buttondown` + secret `BUTTONDOWN_API_KEY` si tu veux des abonnés publics avec désinscription gérée. *(Chemin non testé en conditions réelles : vérifie le premier envoi.)*
4. **GitHub Pages** : *Settings → Pages → Source : GitHub Actions*.
   ⚠️ Le site de veille devient la racine du Pages du dépôt ; le jeu existant est republié sous `/jeu/`.
5. **Variable** `SITE_URL` = l'URL Pages (ex. `https://<compte>.github.io/sir_julian/`) — utilisée pour les liens de la newsletter et le flux RSS.
6. **Remplir `config/profil.yml`** et ton portefeuille (fichier ou secret `PORTEFEUILLE_YAML`). C'est ce qui rend la veille personnelle. Tant que les champs `A_COMPLETER` restent vides, l'IA travaille sur des hypothèses.
7. *Actions → Veille Finance → Run workflow* (mode `quotidien`) pour la première édition.

## Coûts (ordre de grandeur, tarifs Claude Opus 5.5 : 4 $ / 20 $ par million de tokens)

| Tâche | Fréquence | Estimation |
|---|---|---|
| Édition du jour (recherche web + rédaction) | 6 / semaine | ~0,60 à 1,20 $ |
| Édition hebdo | 1 / semaine | ~1 à 2 $ |
| Radar (tri) | 8 / jour | ~0,03 à 0,08 $ |
| **Total** | | **≈ 30 à 50 $ / mois** |

Leviers si c'est trop : variable `VEILLE_MODEL_RADAR` (modèle moins cher pour le tri seul, ex. `claude-haiku-5-5`), `VEILLE_MODEL` pour tout le reste, ou espacer le cron du radar. Fixe une limite de dépense mensuelle dans la console Anthropic.

GitHub Actions est gratuit sur un dépôt public (2 000 min/mois en privé — ce système en consomme ≈ 300 à 500).

## Personnaliser

- `config/profil.yml` — ta situation, tes règles, ton objectif de carrière.
- `config/structure.yml` — rubriques, ordre, consignes. Ajoute/retire librement.
- `config/sources.yml` — flux RSS et indicateurs de marché.
- Horaires — `.github/workflows/veille-finance.yml` (en UTC).

## Tester localement

```bash
cd veille-finance
pip install -r requirements.txt
NEWSLETTER_DISABLED=1 python -m veille.main quotidien --demo   # rendu sans IA
open _site/index.html
ANTHROPIC_API_KEY=... NEWSLETTER_DISABLED=1 python -m veille.main quotidien   # vraie édition
```

## Limites connues

- Les adresses de certains flux RSS changent sans prévenir : un flux mort est ignoré (visible dans les logs Actions), pas bloquant. Vérifie les logs du premier lancement et corrige `sources.yml`.
- GitHub peut retarder les crons de quelques minutes à heures de forte charge, et désactive les workflows planifiés après 60 jours sans activité sur le dépôt (les commits du bot comptent normalement comme activité).
- Si tu diffuses la newsletter **à d'autres personnes**, la frontière entre information et conseil en investissement personnalisé devient un sujet réglementaire réel (statut CIF, règles AMF sur les influenceurs financiers). Garde le profil générique dans ce cas.
