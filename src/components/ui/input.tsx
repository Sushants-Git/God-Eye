import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-xl border border-[var(--border)] bg-[var(--surface-card)]",
        "px-3 py-2 text-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)]",
        "transition-all duration-150",
        "focus:outline-none focus:border-[var(--brand-ring)] focus:ring-2 focus:ring-[var(--brand-ring)]",
        "focus:bg-white",
        className
      )}
      {...props}
    />
  );
}
