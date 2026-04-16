import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "./utils";

export function DataTable({ columns, rows, sortState, onSort, rowClassName }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-borderSoft">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-borderSoft text-left text-sm">
          <thead className="bg-brand-blue-tint/60">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className="px-4 py-3 font-semibold text-ink">
                  {column.sortable ? (
                    <button className="inline-flex items-center gap-2" onClick={() => onSort(column.key)} type="button">
                      <span>{column.label}</span>
                      {sortState.key !== column.key ? (
                        <ArrowUpDown className="h-4 w-4 text-muted" />
                      ) : sortState.direction === "asc" ? (
                        <ArrowUp className="h-4 w-4 text-brand-red" />
                      ) : (
                        <ArrowDown className="h-4 w-4 text-brand-red" />
                      )}
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-borderSoft bg-white">
            {rows.map((row, index) => (
              <tr key={row.id ?? `${index}`} className={cn(index % 2 === 1 && "bg-brand-blue-tint/20", rowClassName?.(row, index))}>
                {columns.map((column) => (
                  <td key={column.key} className="px-4 py-3 text-muted">
                    {column.render ? column.render(row[column.key], row) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
