import { cn } from "@/lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "outline";
  size?: "sm" | "md" | "icon";
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-150 cursor-pointer select-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]",
        "disabled:opacity-40 disabled:pointer-events-none",
        variant === "primary" && [
          "bg-[var(--brand)] text-white",
          "hover:bg-[var(--brand-hover)]",
          "active:scale-[0.97]"
        ],
        variant === "ghost" && [
          "bg-transparent text-[var(--ink-muted)]",
          "hover:bg-[var(--surface)] hover:text-[var(--ink)]",
          "active:scale-[0.97]"
        ],
        variant === "outline" && [
          "border border-[var(--border)] bg-transparent text-[var(--ink)]",
          "hover:border-[var(--border-hover)] hover:bg-[var(--surface)]",
          "active:scale-[0.97]"
        ],
        size === "sm" && "text-xs px-3 py-1.5",
        size === "md" && "text-sm px-4 py-2",
        size === "icon" && "w-8 h-8 rounded-full p-0",
        className
      )}
      {...props}
    />
  );
}
