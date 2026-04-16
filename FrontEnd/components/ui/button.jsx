import { cn } from "./utils";

export function Button({ className = "", variant = "default", ...props }) {
  const variants = {
    default: "bg-brand-red text-white hover:bg-brand-red-light",
    outline: "border border-brand-blue text-brand-blue hover:bg-brand-blue-tint",
    ghost: "text-brand-blue hover:bg-brand-blue-tint",
  };

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant] ?? variants.default,
        className,
      )}
      {...props}
    />
  );
}
