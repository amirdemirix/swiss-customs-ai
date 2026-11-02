import { cn } from "@/lib/utils";
export const Table = ({ className, ...p }: React.TableHTMLAttributes<HTMLTableElement>) => (
  <div className="w-full overflow-x-auto"><table className={cn("w-full border-collapse text-sm", className)} {...p} /></div>
);
export const THead = (p: React.HTMLAttributes<HTMLTableSectionElement>) => <thead className="bg-muted/60 text-left" {...p} />;
export const TBody = (p: React.HTMLAttributes<HTMLTableSectionElement>) => <tbody className="divide-y" {...p} />;
export const TR = ({ className, ...p }: React.HTMLAttributes<HTMLTableRowElement>) => <tr className={cn("hover:bg-muted/40", className)} {...p} />;
export const TH = ({ className, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
  <th className={cn("h-9 whitespace-nowrap border-b px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground", className)} {...p} />
);
export const TD = ({ className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) => <td className={cn("h-10 whitespace-nowrap px-3 align-middle", className)} {...p} />;
