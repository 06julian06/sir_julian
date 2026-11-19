# Cap 2046

Site personnel : les événements qui peuvent bouger les marchés, rapportés à ton PEA, avec un verdict
dont la valeur par défaut est **« Ne rien faire, continue ton DCA »**. HTML/CSS/JS pur, aucun build, aucune dépendance.

## Mettre en ligne

Voir **`MISE_EN_LIGNE.md`** à la racine du dépôt : Netlify sert Cap 2046 à la racine et relaie la veille IA
sous `/veille/`, sans jamais redéployer pour une mise à jour de données (chaque déploiement Netlify coûte des crédits).

## Ce qui se met à jour tout seul

Chaque matin, le workflow **Veille Finance** lance `scripts/maj_evenements.py` sur les sources officielles :
Fed, BCE, Banque d'Angleterre, Banque du Japon, BEA (PIB et PCE, date et heure via flux ICS), Euronext, NYSE,
TotalEnergies. Le résultat est publié sur GitHub Pages et lu par le site via `/data/events-live.json`
(relais Netlify). Si une source échoue, les anciennes dates sont conservées et une *issue* GitHub est ouverte.
Si le relais est indisponible, le site utilise la copie `data/events.json` livrée avec lui.

## Ce qui reste manuel : 10 minutes par semaine (le dimanche)

Fichier : `data/events_manuels.json` (modifiable directement sur github.com, bouton ✏️).

1. **Onglet Plan → « À vérifier à la main »** : la liste exacte de ce qui est « non vérifié », avec les liens.
2. Pour chaque date confirmée sur la source officielle : `"verifie": true`, `"verifie_le": "AAAA-MM-JJ"`,
   et mets la note à jour.
3. **Résultats d'entreprises** (section `a_confirmer`) : dès qu'une société publie sa date sur son site
   investisseurs, déplace-la dans `events` (modèle : copier un événement existant, `categorie: "resultats"`,
   `societes: ["Nvidia"]`).
4. **Géopolitique / budget** : ajoute ou retire les échéances (élections, droits de douane, budget).
5. **Une fois par mois : compositions des ETF** (`data/etf.json`). Ouvre la factsheet de l'émetteur, recopie
   les poids des pays et des grandes entreprises, la date des données, passe `"verifie": true`.
6. Lance le workflow à la main (*Actions → Cap 2046 → Run workflow*) ou attends le lendemain matin.

## Non vérifié à ce jour (19/11/2026)

- **Statistiques américaines du BLS** (emploi, inflation CPI) : le site du BLS bloque la lecture automatique ;
  dates reprises de calendriers tiers concordants. CPI de février : 10 ou 11 février selon les sources.
- **Inflation zone euro (Eurostat)** : calendrier affiché en JavaScript, pas de flux exploitable trouvé.
- **Insee** : idem, aucune date publiée dans le site pour l'instant.
- **Résultats** de Nvidia, Apple, Microsoft, ASML, SAP, LVMH, Saint-Gobain : sites bloqués ou dates non publiées.
- **Budget 2027, financement de l'État américain, trêve États-Unis/Chine** : dates citées par la presse ou des
  cabinets spécialisés, non lues sur une source officielle.
- **Échéances d'options, reconstitution du Nasdaq-100** : déduites de la règle habituelle.
- **Heures** des décisions Fed, BCE, BoE : horaire habituel, non écrit sur les pages officielles.
- **Toutes les compositions d'ETF**, y compris la correspondance du code ETZ avec le fonds BNP Paribas Easy STOXX Europe 600.
- **Cours des lignes** : aucune source gratuite et fiable n'a pu être vérifiée (Stooq refuse les connexions
  automatiques) → saisie manuelle.

## Calculs (vérifiables à la main)

- **Poids** = parts × cours ÷ (somme des lignes + espèces).
- **Exposition** à un événement = Σ (poids de la ligne × part de la ligne concernée), par pays pour une banque
  centrale ou une statistique, par entreprise pour des résultats.
- **Impact** : fort si importance forte et exposition ≥ 40 % (moyenne : ≥ 70 %) ; résultats ≥ 3 % du portefeuille.
  Moyen : importance forte ≥ 10 %, moyenne ≥ 20 %, résultats ≥ 1 %. Sinon faible. Jours fermés : toujours faible.
- **Verdict** : « Ne rien faire » par défaut ; « Surveiller » si impact fort ou fiscalité ; « Revoir l'allocation »
  seulement si impact fort **et** une ligne s'écarte de plus de 5 points de sa cible (ou dépasse le plafond).
  La correction passe toujours par les versements, jamais par une vente.
- **Prochain versement** : entièrement sur la ligne à laquelle il manque le plus d'euros pour atteindre sa cible,
  parmi celles que tu renforces encore (Nasdaq-100 et Saint-Gobain exclus).

## Tes données

Portefeuille, plan et journal sont stockés **dans ton navigateur uniquement** (localStorage). Exporte-les
(onglet Journal ou Plan → « Exporter ») pour les sauvegarder ou les passer sur un autre appareil.

## V2 (après ta validation de la V1)

Netlify Function avec cache pour : cours en différé (source à valider), lecture des calendriers bloqués depuis
un serveur, et synchronisation du portefeuille entre tes appareils.
