import { Planned } from "@/components/layout/planned";
export default function Page() {
  return <Planned title="Rechnungen" phase={4} items={["Multi-Upload per Drag & Drop (PDF, Scan, JPG, PNG, XLSX, CSV)", "Upload-Fortschritt und automatische Verarbeitung", "Duplikaterkennung per Dateihash", "Kontrollansicht: Original links, Daten rechts"]} />;
}
