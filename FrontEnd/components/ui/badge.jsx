import { cn } from "./utils";

const statusClasses = {
  normal: "bg-brand-blue-tint text-brand-blue",
  compliant: "bg-brand-blue-tint text-brand-blue",
  resolved: "bg-brand-blue-tint text-brand-blue",
  violation: "bg-brand-red-tint text-brand-red",
  alert: "bg-brand-red-tint text-brand-red",
  active: "bg-brand-red-tint text-brand-red",
  warning: "bg-[#F5A8B8] text-brand-red",
  medium: "bg-[#F5A8B8] text-brand-red",
  high: "bg-brand-red text-white",
  anomaly: "bg-brand-red-tint text-brand-red",
};

export function Badge({ className = "", tone = "normal", children }) {
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", statusClasses[tone] ?? statusClasses.normal, className)}>
      {children}
    </span>
  );
}
