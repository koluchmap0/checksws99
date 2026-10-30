import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Download, Trash2, CheckCircle, XCircle, AlertTriangle, List } from "lucide-react";
import { TEST_IDS } from "@/constants/testIds";

const StatusBadge = ({ status }) => {
  if (status === "valid") return (
    <span className="status-valid inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium">
      <CheckCircle size={12} /> Valide
    </span>
  );
  if (status === "invalid") return (
    <span className="status-invalid inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium">
      <XCircle size={12} /> Invalide
    </span>
  );
  return (
    <span className="status-error inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium">
      <AlertTriangle size={12} /> Erreur
    </span>
  );
};

export default function ResultsTable({ results, onClear }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const filtered = useMemo(() => {
    let items = results;
    if (filter !== "all") {
      items = items.filter(r => r.status === filter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(r => r.email.toLowerCase().includes(q));
    }
    return items;
  }, [results, filter, search]);

  const exportCsv = () => {
    const header = "email,status\n";
    const rows = filtered.map(r => `${r.email},${r.status}`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bonmont_resultats.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (results.length === 0) return null;

  const filterBtn = (value, label, icon, count) => (
    <Button
      data-testid={`filter-${value}-button`}
      variant={filter === value ? "default" : "outline"}
      size="sm"
      onClick={() => setFilter(value)}
      className={`gap-1.5 text-xs ${filter === value ? "" : "border-zinc-700/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"}`}
    >
      {icon} {label}
      <span className="ml-1 text-[10px] opacity-60">({count})</span>
    </Button>
  );

  return (
    <Card data-testid={TEST_IDS.resultsTable} className="bg-zinc-900/50 border-zinc-800/60">
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <CardTitle className="font-heading text-lg font-semibold text-zinc-100">
            Resultats ({filtered.length}/{results.length})
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              data-testid={TEST_IDS.exportCsvButton}
              variant="outline"
              size="sm"
              onClick={exportCsv}
              className="gap-1.5 text-xs border-zinc-700/60 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/50"
            >
              <Download size={14} /> Export CSV
            </Button>
            <Button
              data-testid={TEST_IDS.clearResultsButton}
              variant="outline"
              size="sm"
              onClick={onClear}
              className="gap-1.5 text-xs border-zinc-700/60 text-red-400 hover:text-red-300 hover:bg-red-900/20"
            >
              <Trash2 size={14} /> Effacer
            </Button>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 mt-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <Input
              data-testid={TEST_IDS.resultsSearchInput}
              placeholder="Rechercher un email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-zinc-950/60 border-zinc-700/50 text-zinc-200 placeholder:text-zinc-600 h-9 text-sm"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {filterBtn("all", "Tous", <List size={13} />, results.length)}
            {filterBtn("valid", "Valides", <CheckCircle size={13} />, results.filter(r => r.status === "valid").length)}
            {filterBtn("invalid", "Invalides", <XCircle size={13} />, results.filter(r => r.status === "invalid").length)}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="rounded-lg border border-zinc-800/60 overflow-hidden">
          <div className="max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900/80 sticky top-0">
                <tr>
                  <th className="text-left py-2.5 px-4 text-xs font-mono uppercase tracking-wider text-zinc-500 font-medium">#</th>
                  <th className="text-left py-2.5 px-4 text-xs font-mono uppercase tracking-wider text-zinc-500 font-medium">Email</th>
                  <th className="text-left py-2.5 px-4 text-xs font-mono uppercase tracking-wider text-zinc-500 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={`${r.email}-${i}`} className="result-row border-t border-zinc-800/40">
                    <td className="py-2.5 px-4 text-zinc-600 font-mono text-xs">{i + 1}</td>
                    <td className="py-2.5 px-4 text-zinc-200 font-mono text-xs">{r.email}</td>
                    <td className="py-2.5 px-4"><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-zinc-600 text-sm">
                      Aucun resultat correspondant
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
