"use client";
import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileUp, Loader2, TriangleAlert, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type ItemState = "queued" | "uploading" | "processing" | "done" | "warning" | "error";
interface Item { id: string; file: File; progress: number; state: ItemState; message?: string }

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.xlsx,.csv";
const CONCURRENCY = 3;

/** Lädt Dateien einzeln per XHR hoch (Fortschritt je Datei), max. 3 gleichzeitig. */
function uploadOne(url: string, file: File, onProgress: (p: number) => void): Promise<{ status: number; body: { ok: boolean; message: string; warning?: string } }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let body = { ok: false, message: `Fehler ${xhr.status}` };
      try { body = JSON.parse(xhr.responseText); } catch { /* Antwort ohne JSON, z. B. Limit des Hostings */ }
      if (xhr.status === 413) body = { ok: false, message: "Datei zu gross für den Upload." };
      resolve({ status: xhr.status, body });
    };
    xhr.onerror = () => resolve({ status: 0, body: { ok: false, message: "Netzwerkfehler – bitte erneut versuchen." } });
    const fd = new FormData();
    fd.append("file", file);
    xhr.send(fd);
  });
}

export function Dropzone({ orderId, maxBytes }: { orderId: string; maxBytes: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [over, setOver] = useState(false);
  const patch = (id: string, p: Partial<Item>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const start = useCallback(async (files: File[]) => {
    const fresh: Item[] = files.map((f, i) => ({ id: `${Date.now()}-${i}-${f.name}`, file: f, progress: 0, state: "queued" }));
    setItems((xs) => [...fresh, ...xs]);
    const queue = [...fresh];
    const worker = async () => {
      for (let it = queue.shift(); it; it = queue.shift()) {
        if (it.file.size > maxBytes) { patch(it.id, { state: "error", message: `Grösser als ${Math.round(maxBytes / 1024 / 1024)} MB.` }); continue; }
        patch(it.id, { state: "uploading" });
        const id = it.id;
        const r = await uploadOne(`/api/orders/${orderId}/documents`, it.file, (p) => patch(id, { progress: p, state: p >= 100 ? "processing" : "uploading" }));
        if (r.body.ok) patch(id, { state: r.body.warning ? "warning" : "done", progress: 100, message: [r.body.message, r.body.warning].filter(Boolean).join(" ") });
        else patch(id, { state: "error", message: r.body.message });
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, fresh.length) }, worker));
    router.refresh();
  }, [orderId, maxBytes, router]);

  return (
    <div className="space-y-3">
      <div
        role="button" tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const f = [...e.dataTransfer.files]; if (f.length) start(f); }}
        className={cn("flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors",
          over ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/40")}
      >
        <FileUp className="size-7 text-primary" />
        <p className="text-sm font-medium">Rechnungen hierher ziehen oder klicken</p>
        <p className="text-xs text-muted-foreground">PDF, Scan (JPG/PNG), Excel (.xlsx), CSV · mehrere Dateien gleichzeitig · max. {Math.round(maxBytes / 1024 / 1024)} MB je Datei</p>
        <input ref={input} type="file" multiple accept={ACCEPT} className="hidden"
          onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ""; if (f.length) start(f); }} />
      </div>
      {items.length > 0 && (
        <ul className="divide-y rounded-lg border text-sm">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-3 px-3 py-2">
              <StateIcon s={it.state} />
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-2"><span className="truncate font-medium">{it.file.name}</span><span className="shrink-0 tabular-nums text-xs text-muted-foreground">{(it.file.size / 1024).toFixed(0)} KB</span></div>
                {(it.state === "uploading" || it.state === "queued") && (
                  <div className="mt-1 h-1.5 overflow-hidden rounded bg-muted" role="progressbar" aria-valuenow={it.progress} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full bg-primary transition-[width]" style={{ width: `${it.progress}%` }} />
                  </div>
                )}
                {it.state === "processing" && <p className="text-xs text-muted-foreground">Wird verarbeitet …</p>}
                {it.message && <p className={cn("text-xs", it.state === "error" ? "text-critical" : it.state === "warning" ? "text-warning" : "text-muted-foreground")}>{it.message}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StateIcon({ s }: { s: ItemState }) {
  if (s === "done") return <CheckCircle2 className="size-4 shrink-0 text-success" />;
  if (s === "warning") return <TriangleAlert className="size-4 shrink-0 text-warning" />;
  if (s === "error") return <XCircle className="size-4 shrink-0 text-critical" />;
  return <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />;
}
