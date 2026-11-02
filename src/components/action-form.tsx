"use client";
import { useActionState } from "react";
import { cn } from "@/lib/utils";

export type ActionResult = { error?: string; ok?: boolean };

/** Formular für Server Actions, das fachliche Ablehnungen (z. B. „letzter Admin“) inline anzeigt. */
export function ActionForm({ action, children, className }: { action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>; children: React.ReactNode; className?: string }) {
  const [state, act, pending] = useActionState(action, {});
  return (
    <form action={act} className={cn(className, pending && "opacity-60")} aria-busy={pending}>
      {children}
      {state.error && <p role="alert" className="basis-full text-xs text-critical">{state.error}</p>}
    </form>
  );
}
