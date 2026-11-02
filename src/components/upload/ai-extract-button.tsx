"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AiExtractButton({ documentId, label = "Mit KI erkennen" }: { documentId: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`/api/documents/${documentId}/extract`, { method: "POST" });
      const b = await r.json().catch(() => ({ ok: false, message: `Fehler ${r.status}` }));
      setMsg(b.ok ? { ok: true, text: `${b.lines} Positionen erkannt, ${b.needsReview} zur Kontrolle markiert.` } : { ok: false, text: b.message });
      router.refresh();
    } finally { setBusy(false); }
  };
  return (
    <div className="space-y-1">
      <Button size="sm" onClick={run} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Sparkles />}{busy ? "Erkenne … (kann bis 2 Min. dauern)" : label}</Button>
      {msg && <p className={`text-xs ${msg.ok ? "text-success" : "text-critical"}`}>{msg.text}</p>}
    </div>
  );
}
