# Bonmont.com Email Checker - PRD

## Problem Statement
Créer un checker email pour bonmont.com qui vérifie si des adresses e-mail sont enregistrées sur le site, en exploitant la réponse du formulaire de connexion (redirect vers ?opinions-login-error=invalid_email quand l'email n'existe pas).

## Architecture
- **Backend**: FastAPI (Python) avec aiohttp pour les requêtes vers bonmont.com
- **Frontend**: React avec Tailwind CSS, shadcn/ui components
- **Database**: MongoDB (initialisé mais non utilisé - app stateless)
- **CLI Script**: checker.py standalone avec aiohttp + tqdm

## Core Logic
1. GET bonmont.com/connexion/ → extraire le nonce WordPress
2. POST avec form data (email, password bidon, nonce)
3. Si redirect Location contient `opinions-login-error=invalid_email` → email invalide
4. Sinon → email valide (enregistré)

## What's Implemented (Phase 1 - MVP)
- [x] Script CLI `checker.py` avec concurrency, retry, progress bar, export CSV
- [x] API endpoints: check-email, check-emails (batch), check-emails-file (upload), checker-script (download)
- [x] Frontend dashboard: vérification unitaire, upload par lot, table de résultats avec filtres, export CSV, documentation CLI
- [x] Nonce WordPress extraction automatique
- [x] Tests backend 6/6 passed, frontend 100%

## User Personas
- Administrateur/responsable bonmont.com qui audite une liste d'emails

## Prioritized Backlog
### P0 (Done)
- Script CLI complet
- API de vérification
- Dashboard web fonctionnel

### P1 (Next)
- Limiter la taille des fichiers uploadés
- Ajouter un compteur de rate limiting côté serveur

### P2 (Future)
- Proxy rotatif pour gros volumes
- Support fichiers Excel (.xlsx)
- Historique des checks (MongoDB)
- Mode streaming (résultats en temps réel)
