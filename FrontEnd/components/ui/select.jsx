import { ChevronDown } from "lucide-react";
import { cn } from "./utils";

export function SelectField({ label, value, onChange, options, className = "" }) {
  return (
    <label className={cn("flex min-w-[160px] flex-col gap-1.5 text-sm", className)}>
      <span className="font-medium text-ink">{label}</span>
      <div className="relative">
        <select
          className="w-full appearance-none rounded-lg border border-brand-blue bg-white px-3 py-2.5 pr-10 text-sm text-ink outline-none ring-0 transition focus:border-brand-red"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-blue" />
      </div>
    </label>
  );
}
