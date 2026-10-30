# Bonmont Email Checker

Script Python autonome pour vérifier en masse si des adresses e-mail sont enregistrées sur bonmont.com, en exploitant la réponse du formulaire de connexion (`opinions-login-error=invalid_email` = email non inscrit).

**Pour** : L'administrateur ou le responsable du site bonmont.com qui veut auditer une liste d'emails.

---

## Fonctionnement

Le formulaire de connexion de bonmont.com (`POST https://bonmont.com/connexion/`) attend deux champs : `opinions_login[email]` et `opinions_login[password]`. Quand l'email n'existe pas, la page redirige vers `?opinions-login-error=invalid_email`. Quand l'email existe (mais le mot de passe est faux), la réponse est différente (autre erreur ou même URL sans ce paramètre). Le script exploite cette différence pour classer chaque email en **valid** (existe) ou **invalid** (n'existe pas).

---

## Fonctionnalités principales

- **Import fichier** : lecture d'un fichier `.txt` ou `.csv` (un email par ligne)
- **Vérification concurrente** : requêtes asynchrones (aiohttp) avec pool de connexions configurable pour traiter 1 000+ emails rapidement
- **Rate limiting** : délai configurable entre les requêtes pour éviter le blocage IP
- **Progression** : barre de progression en temps réel dans le terminal (tqdm)
- **Export résultats** : fichier CSV de sortie avec colonnes `email, status` (valid / invalid / error)
- **Retry automatique** : relance les requêtes échouées (timeout, erreur réseau) jusqu'à 3 fois
- **Résumé** : affichage du nombre d'emails valides, invalides et en erreur à la fin

---

## Flux utilisateur

1. Préparer un fichier `emails.txt` (un email par ligne)
2. Lancer : `python3 checker.py emails.txt -o resultats.csv --concurrency 10`
3. Le script affiche la progression en temps réel
4. À la fin, ouvrir `resultats.csv` pour voir les résultats

---

## Interface

Aucune interface web. Le script tourne en ligne de commande avec des arguments CLI (argparse). La sortie est un fichier CSV + un résumé console.

---

## Phases

### Phase 1 — MVP (maintenant)
- Script `checker.py` complet avec aiohttp, concurrency, rate limiting, retry, export CSV, barre de progression
- Hébergé dans `/app/backend/checker.py`, exécutable directement
- Endpoint API minimal (`POST /api/check-emails`) pour permettre un test via curl avec upload de fichier
- Frontend minimal affichant les instructions d'utilisation du script

### Phase 2
- Ajout d'un proxy rotatif pour les très gros volumes
- Support de fichiers Excel (.xlsx) en entrée
- Mode "streaming" : résultats écrits au fur et à mesure

### Phase 3
- Historique des checks (MongoDB)
- Dashboard web complet avec upload et résultats en temps réel

---

## Hypothèses

- Le formulaire de bonmont.com ne change pas de comportement (redirect `invalid_email` = email inexistant)
- Pas de CAPTCHA actif sur le formulaire de connexion
- Un mot de passe bidon ("check123") suffit pour déclencher la bonne réponse d'erreur
- 10 requêtes concurrentes par défaut avec 0.5s de délai entre chaque batch pour rester sous le radar
- Le script sera lancé depuis la machine locale de l'utilisateur ou depuis ce pod
