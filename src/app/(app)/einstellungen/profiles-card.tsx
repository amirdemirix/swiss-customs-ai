import type { GroupingProfile } from "@prisma/client";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionForm } from "@/components/action-form";
import { GROUPABLE_FIELDS } from "@/domain";
import { saveProfile } from "./profile-actions";

const LABEL: Record<(typeof GROUPABLE_FIELDS)[number], string> = {
  tariffNumber: "Tarifnummer", statisticalKey: "Statistischer Schlüssel", originCountry: "Ursprungsland", preferenceStatus: "Präferenzstatus", customsProcedure: "Zollverfahren",
};
const LOCKED = ["tariffNumber", "originCountry"];

function ProfileForm({ p }: { p: GroupingProfile | null }) {
  return (
    <ActionForm action={saveProfile.bind(null, p?.id ?? null)} className="space-y-3 px-5 py-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-xs font-medium text-muted-foreground">Name<Input name="name" defaultValue={p?.name ?? ""} className="w-72" required /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isDefault" defaultChecked={p?.isDefault ?? false} /> Standard für neue Aufträge</label>
        {p?.isDefault && <Badge tone="primary">Standard</Badge>}
      </div>
      <table className="text-sm">
        <thead className="text-left text-xs text-muted-foreground"><tr><th className="pr-6 font-medium">Merkmal</th><th className="pr-6 font-medium">trennt Positionen</th><th className="font-medium">Pflicht (fehlt → keine Zusammenfassung)</th></tr></thead>
        <tbody>
          {GROUPABLE_FIELDS.map((f) => {
            const locked = LOCKED.includes(f);
            return (
              <tr key={f}><td className="py-0.5 pr-6">{LABEL[f]}</td>
                <td><input type="checkbox" name={`key.${f}`} defaultChecked={locked || (p?.keyFields ?? GROUPABLE_FIELDS).includes(f)} disabled={locked} aria-label={`${LABEL[f]} trennt`} /></td>
                <td><input type="checkbox" name={`req.${f}`} defaultChecked={locked || (p?.requiredFields ?? []).includes(f)} disabled={locked} aria-label={`${LABEL[f]} Pflicht`} /></td></tr>
            );
          })}
        </tbody>
      </table>
      <label className="block space-y-1 text-xs font-medium text-muted-foreground">Zusätzliche Trennmerkmale (kommagetrennt, z. B. additionalCode, permitNumber, vatCode)
        <Input name="extraKeys" defaultValue={p?.extraKeys.join(", ") ?? ""} className="max-w-xl" /></label>
      {p && p.extraKeys.length > 0 && (
        <div className="flex flex-wrap gap-4 text-sm">{p.extraKeys.map((k) => (
          <label key={k} className="flex items-center gap-1.5"><input type="checkbox" name={`reqx.${k}`} defaultChecked={p.requiredFields.includes(`extra.${k}`)} /> {k} ist Pflicht</label>))}</div>
      )}
      <Button size="sm">{p ? "Profil speichern" : "Profil anlegen"}</Button>
    </ActionForm>
  );
}

export function ProfilesCard({ profiles }: { profiles: GroupingProfile[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>Gruppierungsprofile</CardTitle><span className="text-xs text-muted-foreground">Tarifnummer und Ursprung trennen immer; Änderungen wirken bei der nächsten Prüfung eines Auftrags</span></CardHeader>
      <div className="divide-y">
        {profiles.map((p) => <ProfileForm key={p.id} p={p} />)}
        <details><summary className="cursor-pointer px-5 py-3 text-sm font-medium text-primary">+ Neues Profil</summary><ProfileForm p={null} /></details>
      </div>
    </Card>
  );
}
