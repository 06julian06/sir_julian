# Veille Finance — site + newsletter pilotés par IA, 24h/24

Un système qui tourne seul sur GitHub Actions : il collecte l'actualité financière,
la fait analyser par Claude selon **ton profil**, publie un site (GitHub Pages) et
t'envoie une newsletter. Zéro serveur à gérer.

```
 toutes les 15 min ─► DIRECT  21 flux mondiaux (Google Actualités, BBC, Le Monde, régulateurs…)
                              + cours en différé + calendrier économique (attendus) ─► page « Direct »
 toutes les heures ─► RADAR   direct + tri IA (importance, « pour toi ») ─► alerte e-mail si majeur
 chaque matin  ─► QUOTIDIEN  RSS + cotations + recherche web IA ─► édition structurée ─► site + newsletter
 le dimanche   ─► HEBDO      bilan des 7 éditions + recherche ─► édition de fond ─► site + newsletter
```

## Les pages du site

| Page | Mise à jour | Contenu |
|---|---|---|
| **Direct** | 15 min (+ rafraîchissement auto du navigateur toutes les 2 min) | Fil mondial filtrable (Monde, Élections, Banques centrales, Macro, Marchés, Entreprises, Régulation, Crypto), recherche, bandeau de cours, **calendrier économique avec attendu / précédent / réel**, **grands rendez-vous** (élections, BCE, Fed…) avec ce qu'attend le marché et les scénarios |
| **Édition** | chaque matin + dimanche | L'émission du jour (structure ci-dessous) |
| **Portefeuille** | chaque matin | Tableau de bord visuel (pourcentages seulement : la page est publique) |
| **Mon espace** | chaque matin | **Privé et chiffré** — voir ci-dessous |

## Apprendre : Académie, décryptages, questions, lexique, simulateur

| Fonction | Fréquence | Comment |
|---|---|---|
| **Académie** | chaque lundi ~6 h | Cours n°N du programme (`config/academie.yml`, 40 semaines en 7 modules : bases, lire les comptes, valorisation, macro, portefeuille, produits avancés, finance réglementée). Chaque cours reçoit le résumé des précédents : progression continue. Exemple chiffré, cas réel sourcé, exercice + corrigé, quiz, « à retenir », angle pro. Archivé et classé par module, envoyé par e-mail. |
| **Décryptages** | toutes les heures | Toute actualité notée 4 ou 5/5 par l'IA (ex. « départ du PDG de Nvidia ») reçoit sa page : faits, ce que ça veut dire, qui est concerné, attendus, pour toi. Lien depuis le fil en direct. Maximum 2 par heure (coût maîtrisé). |
| **Questions** | réponse en moins d'une heure | Pose n'importe quelle question (Issue GitHub « Question pour la veille », bouton sur la page Questions). Recherche web, réponse sourcée sur le site et en commentaire. |
| **Lexique** | s'enrichit tout seul | 30 termes de base (EBITDA, PER/P/E, EV/EBITDA, FCF, CET1, MiFID…) + chaque terme expliqué dans un cours, un décryptage ou une réponse. Recherche instantanée. |
| **Simulateur** | dans le navigateur | Intérêts composés et DCA (frais, inflation), test de krach, versement nécessaire pour un objectif, valorisation d'une entreprise (PER, PEG, EV/EBITDA, FCF yield, dette/EBITDA, ROE expliqués ligne par ligne). |
| **Résultats publiés** | chaque matin | Rubrique de l'édition : chiffres clés contre consensus, guidance, ce qu'il faut retenir. |

Coût supplémentaire estimé : ~2 à 4 $ par cours, ~0,10 à 0,20 $ par décryptage ou réponse.

## Mon espace (privé)

Le dépôt et le site sont **publics** : ton espace est donc chiffré (AES-256-GCM, clé dérivée de ta phrase secrète
par PBKDF2-SHA256, 600 000 itérations). Le fichier publié est illisible sans la phrase ; le déchiffrement se fait
dans ton navigateur, rien n'est envoyé nulle part. Tes chiffres viennent du secret `FINANCES_YAML`
(modèle : `config/finances.exemple.yml`), jamais d'un fichier versionné.

- **Gamification** : niveau (1 à 7, d'« Apprenti » à « Indépendant », selon ta progression vers l'indépendance
  financière), barre d'XP, **score de santé /100** sur 5 piliers (épargne, sécurité, dette, investissement,
  discipline), 9 badges, série de mois en hausse, missions à cocher (calculées + proposées par le coach IA).
- **Compte de résultat** : revenus d'activité / passifs, charges fixes / variables, excédent brut (EBE),
  charges financières, résultat net (= capacité d'épargne).
- **Tableau des flux de trésorerie** : flux opérationnels, de financement, free cash flow, flux d'investissement,
  variation de trésorerie — en cascade.
- **Bilan** : actif par catégorie (portefeuille valorisé au marché automatiquement), dettes, capitaux propres
  (patrimoine net), équation du bilan.
- **Ratios** avec seuils et statut : taux d'épargne, réserve de liquidité, taux d'effort (seuil HCSF 35 %),
  dettes ÷ actifs, couverture par revenus passifs, part investie, progression vers le nombre FIRE.
- **Trajectoire** : projection à 15 ans (2 / 4 / 6 % réels) + historique réel relevé chaque matin.
- Chaque terme financier a sa définition au survol.

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
   `CLAUDE_CODE_OAUTH_TOKEN` = jeton de ton abonnement Claude (`claude setup-token`).
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
7. **Mon espace** : secrets `FINANCES_YAML` (contenu de ton `finances.exemple.yml` rempli) et `ESPACE_PASSPHRASE`
   (une phrase longue et unique : si tu la perds, l'historique chiffré est perdu ; si tu la changes, il repart de zéro).
8. *Actions → Veille Finance → Run workflow* (mode `quotidien`) pour la première édition.

Les données (éditions, fil, espace chiffré) sont stockées sur la branche **`veille-data`**, réécrite à chaque
passage : l'historique du code reste propre malgré les 96 mises à jour quotidiennes.

## Coûts : 0 € de plus

L'IA utilise ton **abonnement Claude existant** via Claude Code (secret `CLAUDE_CODE_OAUTH_TOKEN`, généré par
`claude setup-token`). Aucune API facturée à l'usage. Les passages IA (tri 3 fois par jour, édition du matin,
cours du lundi, décryptages, réponses) comptent dans les limites de ton abonnement. GitHub Actions et Pages
sont gratuits sur un dépôt public, Netlify reste dans son offre gratuite. Une clé `ANTHROPIC_API_KEY`, si tu en
ajoutes une un jour, est prioritaire et facturée à l'usage : ne la crée pas si tu veux rester à 0 €.

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
CLAUDE_CODE_OAUTH_TOKEN=... NEWSLETTER_DISABLED=1 python -m veille.main quotidien   # vraie édition (abonnement Claude, Claude Code installé)
```

## Limites connues

- Les adresses de certains flux RSS changent sans prévenir : un flux mort est ignoré (visible dans les logs Actions), pas bloquant. Vérifie les logs du premier lancement et corrige `sources.yml`.
- GitHub peut retarder les crons de quelques minutes à heures de forte charge, et désactive les workflows planifiés après 60 jours sans activité sur le dépôt (les commits du bot comptent normalement comme activité).
- Si tu diffuses la newsletter **à d'autres personnes**, la frontière entre information et conseil en investissement personnalisé devient un sujet réglementaire réel (statut CIF, règles AMF sur les influenceurs financiers). Garde le profil générique dans ce cas.
