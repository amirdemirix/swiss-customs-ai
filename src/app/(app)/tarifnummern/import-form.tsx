"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { importTariffDataset, type ImportTariffState } from "./actions";

export function TariffImportForm() {
  const [s, act, pending] = useActionState<ImportTariffState, FormData>(importTariffDataset, {});
  return (
    <form action={act} className="space-y-3">
      <div className="grid gap-3 md:grid-cols-4">
        <label className="space-y-1 text-xs font-medium text-muted-foreground">Datei (CSV/XLSX)<Input type="file" name="file" accept=".csv,.xlsx" required /></label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">Bezeichnung<Input name="name" placeholder="Tares Stand 2026-11" required /></label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">Quelle<Input name="source" placeholder="Export aus Tares (BAZG)" required /></label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">Gültig ab<Input type="date" name="validFrom" required /></label>
      </div>
      <div className="flex items-center gap-3">
        <Button disabled={pending}>{pending ? "Importiere …" : "Datenstand importieren"}</Button>
        {s.message && <p role="status" className={`text-sm ${s.ok ? "text-success" : "text-critical"}`}>{s.message}</p>}
      </div>
      <p className="text-xs text-muted-foreground">Erwartete Spalten: Tarifnummer, Beschreibung, optional statistischer Schlüssel und Einheit. Nur Daten aus verifizierten Quellen importieren.</p>
    </form>
  );
}
