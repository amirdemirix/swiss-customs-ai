"use client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Card className="mx-auto mt-10 max-w-lg">
      <CardContent className="space-y-3">
        <h1>Aktion nicht möglich</h1>
        <p className="text-sm text-muted-foreground">{error.message && !error.message.startsWith("An error occurred") ? error.message : "Ein unerwarteter Fehler ist aufgetreten."}</p>
        {error.digest && <p className="font-mono text-xs text-muted-foreground">Referenz: {error.digest}</p>}
        <Button variant="outline" onClick={reset}>Erneut versuchen</Button>
      </CardContent>
    </Card>
  );
}
