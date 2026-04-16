import { cn } from "@/lib/utils";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "brand" | "muted" | "outline" | "running";
}

export function Badge({ className, variant = "muted", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none whitespace-nowrap",
        variant === "brand" && "bg-[var(--brand-soft)] text-[var(--brand)]",
        variant === "running" && "bg-[var(--brand-soft)] text-[var(--brand)]",
        variant === "muted" && "bg-[var(--surface)] text-[var(--ink-muted)]",
        variant === "outline" && "border border-[var(--border)] text-[var(--ink-muted)] bg-transparent",
        className
      )}
      {...props}
    />
  );
}
