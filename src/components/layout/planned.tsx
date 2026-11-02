import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "./page-header";
import { Badge } from "@/components/ui/badge";

/** Ehrlicher Platzhalter für Module, die in späteren Phasen umgesetzt werden. */
export function Planned({ title, phase, items }: { title: string; phase: number; items: string[] }) {
  return (
    <>
      <PageHeader title={title} />
      <Card>
        <CardContent className="space-y-3">
          <Badge tone="info">Geplant – Phase {phase}</Badge>
          <p className="text-sm text-muted-foreground">Dieses Modul ist im Datenmodell bereits angelegt. Die Oberfläche folgt in Phase {phase}:</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">{items.map((i) => <li key={i}>{i}</li>)}</ul>
        </CardContent>
      </Card>
    </>
  );
}
