import { useState, useRef, useCallback } from "react";
import "@/App.css";
import axios from "axios";
import { Toaster, toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Mail, Upload, Search, Download, CheckCircle, XCircle,
  AlertTriangle, Terminal, Zap, Shield, FileText, Loader2
} from "lucide-react";
import ResultsTable from "@/components/ResultsTable";
import CliDocs from "@/components/CliDocs";
import { TEST_IDS } from "@/constants/testIds";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/* ─── Header ──────────────────────────────────── */
const Header = () => (
  <header data-testid={TEST_IDS.appHeader} className="glass-header sticky top-0 z-50 px-4 lg:px-8 py-3">
    <div className="max-w-7xl mx-auto flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
          <Shield size={16} className="text-emerald-400" />
        </div>
        <div>
          <h1 className="font-heading text-base font-semibold text-zinc-100 tracking-tight">
            Bonmont Email Auditor
          </h1>
          <p className="text-[11px] text-zinc-500 font-mono tracking-wide">bonmont.com</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs text-zinc-500">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          En ligne
        </span>
      </div>
    </div>
  </header>
);

/* ─── Stat Card ───────────────────────────────── */
const StatCard = ({ testId, icon, label, value, variant }) => (
  <Card data-testid={testId} className={`stat-card-${variant} bg-zinc-900/50 border-zinc-800/60`}>
    <CardContent className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-mono uppercase tracking-widest text-zinc-500 mb-1">{label}</p>
          <p className="text-2xl font-heading font-bold text-zinc-100">{value}</p>
        </div>
        <div className="opacity-40">{icon}</div>
      </div>
    </CardContent>
  </Card>
);

/* ─── Main App ────────────────────────────────── */
export default function App() {
  const [singleEmail, setSingleEmail] = useState("");
  const [singleResult, setSingleResult] = useState(null);
  const [singleLoading, setSingleLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchFile, setBatchFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  const stats = {
    total: results.length,
    valid: results.filter(r => r.status === "valid").length,
    invalid: results.filter(r => r.status === "invalid").length,
    error: results.filter(r => r.status === "error" || (r.status && r.status.startsWith("error"))).length,
  };

  /* Single email check */
  const checkSingleEmail = async () => {
    if (!singleEmail.trim() || !singleEmail.includes("@")) {
      toast.error("Entrez une adresse email valide");
      return;
    }
    setSingleLoading(true);
    setSingleResult(null);
    try {
      const res = await axios.post(`${API}/check-email`, { email: singleEmail.trim() });
      setSingleResult(res.data);
      setResults(prev => {
        const idx = prev.findIndex(r => r.email === res.data.email);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = res.data;
          return updated;
        }
        return [res.data, ...prev];
      });
      if (res.data.status === "valid") {
        toast.success("Email trouve sur bonmont.com");
      } else if (res.data.status === "invalid") {
        toast.info("Email non enregistre sur bonmont.com");
      } else {
        toast.warning("Erreur lors de la verification");
      }
    } catch (e) {
      toast.error("Erreur de connexion au serveur");
    } finally {
      setSingleLoading(false);
    }
  };

  /* File upload handling */
  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) setBatchFile(e.dataTransfer.files[0]);
  }, []);

  const handleFileSelect = (e) => {
    if (e.target.files?.[0]) setBatchFile(e.target.files[0]);
  };

  /* Batch check */
  const startBatchCheck = async () => {
    if (!batchFile) {
      toast.error("Selectionnez un fichier d'emails");
      return;
    }
    setBatchLoading(true);
    setBatchProgress(15);
    const formData = new FormData();
    formData.append("file", batchFile);

    try {
      setBatchProgress(40);
      const res = await axios.post(`${API}/check-emails-file`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setBatchProgress(100);
      if (res.data.results) {
        setResults(prev => [...res.data.results, ...prev]);
        toast.success(`${res.data.total} emails verifies`);
      } else if (res.data.error) {
        toast.error(res.data.error);
      }
    } catch (e) {
      toast.error("Erreur lors du traitement du fichier");
    } finally {
      setBatchLoading(false);
      setBatchFile(null);
      setTimeout(() => setBatchProgress(0), 1500);
    }
  };

  /* Download sample file */
  const downloadSample = () => {
    const sample = "user1@example.com\nuser2@example.com\ntest@bonmont.com\nadmin@bonmont.com\n";
    const blob = new Blob([sample], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "emails_sample.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#09090b]">
      <Toaster theme="dark" position="top-right" richColors />
      <Header />

      <main className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-8">
        {/* Stats Row */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-up" style={{ animationDelay: "0.1s" }}>
          <StatCard testId={TEST_IDS.statTotal} icon={<Zap size={22} className="text-cyan-400" />} label="Total" value={stats.total} variant="total" />
          <StatCard testId={TEST_IDS.statValid} icon={<CheckCircle size={22} className="text-green-400" />} label="Valides" value={stats.valid} variant="valid" />
          <StatCard testId={TEST_IDS.statInvalid} icon={<XCircle size={22} className="text-red-400" />} label="Invalides" value={stats.invalid} variant="invalid" />
          <StatCard testId={TEST_IDS.statError} icon={<AlertTriangle size={22} className="text-amber-400" />} label="Erreurs" value={stats.error} variant="error" />
        </section>

        {/* Checker Workspace */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-up" style={{ animationDelay: "0.2s" }}>
          {/* Single Email */}
          <Card className="lg:col-span-7 bg-zinc-900/50 border-zinc-800/60">
            <CardHeader className="pb-3">
              <CardTitle className="font-heading text-lg font-semibold text-zinc-100 flex items-center gap-2">
                <Mail size={18} className="text-emerald-500" />
                Verification unitaire
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  data-testid={TEST_IDS.singleEmailInput}
                  type="email"
                  placeholder="email@bonmont.com"
                  value={singleEmail}
                  onChange={e => setSingleEmail(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && checkSingleEmail()}
                  className="flex-1 bg-zinc-950/60 border-zinc-700/50 text-zinc-200 placeholder:text-zinc-600 h-10"
                />
                <Button
                  data-testid={TEST_IDS.singleEmailSubmitButton}
                  onClick={checkSingleEmail}
                  disabled={singleLoading}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 h-10 gap-2"
                >
                  {singleLoading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Search size={16} />
                  )}
                  Verifier
                </Button>
              </div>

              {/* Single result */}
              {singleResult && (
                <div data-testid={TEST_IDS.singleEmailResultBadge} className={`flex items-center gap-3 p-3 rounded-lg border ${
                  singleResult.status === "valid"
                    ? "bg-green-500/8 border-green-500/20"
                    : singleResult.status === "invalid"
                    ? "bg-red-500/8 border-red-500/20"
                    : "bg-amber-500/8 border-amber-500/20"
                }`}>
                  {singleResult.status === "valid" ? (
                    <CheckCircle size={18} className="text-green-400 shrink-0" />
                  ) : singleResult.status === "invalid" ? (
                    <XCircle size={18} className="text-red-400 shrink-0" />
                  ) : (
                    <AlertTriangle size={18} className="text-amber-400 shrink-0" />
                  )}
                  <div>
                    <p className="text-sm font-mono text-zinc-200">{singleResult.email}</p>
                    <p className={`text-xs mt-0.5 ${
                      singleResult.status === "valid" ? "text-green-400" :
                      singleResult.status === "invalid" ? "text-red-400" : "text-amber-400"
                    }`}>
                      {singleResult.status === "valid" ? "Email enregistre sur bonmont.com" :
                       singleResult.status === "invalid" ? "Email non enregistre sur bonmont.com" :
                       "Erreur lors de la verification"}
                    </p>
                  </div>
                </div>
              )}

              {singleLoading && (
                <div className="pulse-check rounded-lg p-2 border border-emerald-500/20 bg-emerald-500/5">
                  <p className="text-xs text-emerald-400 text-center font-mono">
                    Verification en cours sur bonmont.com...
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* File Upload */}
          <Card className="lg:col-span-5 bg-zinc-900/50 border-zinc-800/60">
            <CardHeader className="pb-3">
              <CardTitle className="font-heading text-lg font-semibold text-zinc-100 flex items-center gap-2">
                <Upload size={18} className="text-emerald-500" />
                Verification par lot
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                data-testid={TEST_IDS.fileUploadDropzone}
                className={`dropzone-area rounded-lg p-6 text-center cursor-pointer transition-all ${
                  dragActive ? "drag-active" : ""
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  data-testid={TEST_IDS.fileInputHidden}
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <FileText size={28} className="mx-auto mb-3 text-zinc-600" />
                {batchFile ? (
                  <div>
                    <p className="text-sm text-zinc-200 font-medium">{batchFile.name}</p>
                    <p className="text-xs text-zinc-500 mt-1">
                      {(batchFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-zinc-400">
                      Glissez un fichier <span className="text-zinc-200">.txt</span> ou{" "}
                      <span className="text-zinc-200">.csv</span>
                    </p>
                    <p className="text-xs text-zinc-600 mt-1">Un email par ligne</p>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  data-testid={TEST_IDS.startBatchCheckButton}
                  onClick={startBatchCheck}
                  disabled={!batchFile || batchLoading}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                >
                  {batchLoading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Zap size={16} />
                  )}
                  {batchLoading ? "Verification..." : "Lancer la verification"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={downloadSample}
                  className="border-zinc-700/60 text-zinc-400 hover:text-zinc-200 text-xs px-3"
                  title="Telecharger un fichier exemple"
                >
                  <Download size={14} />
                </Button>
              </div>

              {/* Batch progress */}
              {batchProgress > 0 && (
                <div className="space-y-2">
                  <div className="relative overflow-hidden rounded-full">
                    <Progress
                      data-testid={TEST_IDS.batchProgressBar}
                      value={batchProgress}
                      className="h-2 bg-zinc-800"
                    />
                    {batchLoading && <div className="progress-scan absolute inset-0" />}
                  </div>
                  <p data-testid={TEST_IDS.batchStatusText} className="text-xs text-zinc-500 font-mono text-center">
                    {batchProgress < 100 ? "Traitement en cours..." : "Termine !"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Results Table */}
        <section className="animate-fade-up" style={{ animationDelay: "0.3s" }}>
          <ResultsTable results={results} onClear={() => setResults([])} />
        </section>

        {/* CLI Documentation */}
        <section className="animate-fade-up" style={{ animationDelay: "0.4s" }}>
          <CliDocs />
        </section>

        {/* Footer */}
        <footer className="text-center py-6 border-t border-zinc-800/40">
          <p className="text-xs text-zinc-600 font-mono">
            Bonmont.com Email Auditor &mdash; Outil d'administration
          </p>
        </footer>
      </main>
    </div>
  );
}
