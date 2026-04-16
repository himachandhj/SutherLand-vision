import { cn } from "./utils";

export function Card({ className = "", ...props }) {
  return <div className={cn("rounded-2xl border border-borderSoft bg-white shadow-card", className)} {...props} />;
}

export function CardHeader({ className = "", ...props }) {
  return <div className={cn("flex flex-col gap-1 p-5 pb-3", className)} {...props} />;
}

export function CardTitle({ className = "", ...props }) {
  return <h3 className={cn("text-lg font-semibold text-ink", className)} {...props} />;
}

export function CardDescription({ className = "", ...props }) {
  return <p className={cn("text-sm text-muted", className)} {...props} />;
}

export function CardContent({ className = "", ...props }) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}
