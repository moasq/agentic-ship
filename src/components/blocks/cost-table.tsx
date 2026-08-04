import { Separator } from "@/components/ui/separator";

export interface CostRow {
  tool: string;
  replacedBy: string;
}

interface CostTableProps {
  title: string;
  description: string;
  rows: CostRow[];
  footnote: string;
}

export function CostTable({
  title,
  description,
  rows,
  footnote,
}: CostTableProps) {
  return (
    <section>
      <div className="mx-auto max-w-3xl px-6 py-20">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h2>
        <p className="mt-3 text-muted-foreground">{description}</p>

        <div className="mt-8 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                <th className="pb-3 pr-6 font-medium">Hosted builder</th>
                <th className="pb-3 font-medium">Replaced in this repo by</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.tool} className="border-t border-border">
                  <td className="py-3 pr-6 font-medium">{row.tool}</td>
                  <td className="py-3 font-mono text-xs text-muted-foreground">
                    {row.replacedBy}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Separator className="my-8" />
        <p className="text-sm text-muted-foreground">{footnote}</p>
      </div>
    </section>
  );
}
