# Mise en ligne sur Netlify — tout le système à une seule adresse

```
https://<ton-site>.netlify.app/            → Cap 2046 (calendrier, portefeuille, anti-FOMO, journal, plan)
https://<ton-site>.netlify.app/veille/     → Veille IA : direct, éditions, décryptages, Académie,
                                             simulateur, lexique, questions, mon espace chiffré
```

## Pourquoi ce montage (lis-le une fois)

Netlify facture chaque déploiement : **offre gratuite = 300 crédits/mois, 15 crédits par déploiement**,
soit ~20 mises en ligne par mois. Si les crédits sont épuisés, **Netlify met tous tes sites en pause**.
La veille se met à jour toutes les 15 minutes (~2 900 fois par mois) : impossible de la redéployer sur Netlify.

Donc :
- **GitHub Actions** fait tourner l'IA et publie le résultat sur **GitHub Pages** (gratuit, illimité, dépôt public).
- **Netlify** sert Cap 2046 et **relaie** la veille et les données fraîches via son proxy : même adresse,
  toujours à jour, **zéro redéploiement**. Netlify ne redéploie que quand tu modifies le code de `cap2046/`.
- Coût Netlify attendu : quelques déploiements par mois + un peu de bande passante → reste dans l'offre gratuite
  pour un usage personnel. Surveille quand même *Usage* dans Netlify le premier mois.

## Étapes (20 minutes, une seule fois)

### 1. GitHub (le moteur)
1. Fusionne la pull request dans `main` (les tâches planifiées ne tournent que sur `main`).
2. *Settings → Pages* → Source : **GitHub Actions**.
3. *Settings → Secrets and variables → Actions* :
   - Secret **`ANTHROPIC_API_KEY`** (obligatoire : l'IA).
   - Secrets newsletter : `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `NEWSLETTER_TO` (voir `veille-finance/README.md`).
   - Secrets privés (facultatifs) : `PORTEFEUILLE_YAML`, `FINANCES_YAML`, `ESPACE_PASSPHRASE`.
4. *Actions → Veille Finance → Run workflow → quotidien* : première édition + premier calendrier Cap 2046.
   Vérifie que `https://06julian06.github.io/sir_julian/` s'affiche.

### 2. Netlify (la vitrine)
1. *Add new site → Import an existing project → GitHub →* `sir_julian`.
2. **Base directory : `cap2046`** · Build command : *(vide)* · Publish directory : `cap2046`.
3. *Deploy*. Ouvre l'adresse : Cap 2046 s'affiche, et `/veille/` affiche la veille.
4. (Facultatif) *Domain management* : renomme le site ou branche ton propre domaine.

### 3. Relier les deux
Dans GitHub, *Settings → Secrets and variables → Actions → Variables* :
- **`SITE_URL`** = `https://<ton-site>.netlify.app/veille/` (liens des e-mails et du flux RSS)
- **`CAP2046_URL`** = `https://<ton-site>.netlify.app/` (lien « Cap 2046 » dans le menu de la veille)

### 4. Sur ton téléphone
Ouvre l'adresse Netlify → menu du navigateur → **Ajouter à l'écran d'accueil**.

## Ce qui tourne ensuite sans toi

| Quand | Quoi |
|---|---|
| Toutes les 15 min | Fil mondial, cours en différé, calendrier économique |
| Toutes les heures | Tri IA du fil, décryptages des actualités majeures, réponses à tes questions, alertes e-mail |
| Chaque matin | Édition complète, résultats publiés, calendrier Cap 2046 relu sur les sources officielles, newsletter |
| Chaque lundi | Nouveau cours de l'Académie (+ e-mail) |
| Chaque dimanche | Édition hebdomadaire |

Si une source officielle de Cap 2046 devient illisible, une *issue* GitHub est ouverte (tu reçois un e-mail).

## Si quelque chose ne marche pas
- `/veille/` affiche une erreur 404 → GitHub Pages n'est pas encore activé ou le premier workflow n'a pas tourné.
- Cap 2046 affiche « copie livrée avec le site » au lieu du calendrier frais → même cause ; le site reste
  utilisable avec la copie du 19/11/2026.
- Netlify redéploie trop souvent → *Site configuration → Build & deploy* : vérifie que la base est bien `cap2046`.
