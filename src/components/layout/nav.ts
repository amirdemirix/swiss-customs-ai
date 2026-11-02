import { LayoutDashboard, FolderOpen, FilePlus2, FileText, Table2, Search, Users, Download, Settings } from "lucide-react";
export const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/auftraege", label: "Aufträge", icon: FolderOpen },
  { href: "/auftraege/neu", label: "Neuer Auftrag", icon: FilePlus2 },
  { href: "/rechnungen", label: "Rechnungen", icon: FileText },
  { href: "/zolluebersicht", label: "Zollübersicht", icon: Table2 },
  { href: "/tarifnummern", label: "Tarifnummern", icon: Search },
  { href: "/kunden", label: "Kunden", icon: Users },
  { href: "/exporte", label: "Exporte", icon: Download },
  { href: "/einstellungen", label: "Einstellungen", icon: Settings },
] as const;
