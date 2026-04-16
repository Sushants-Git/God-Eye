import { useState } from "react";
import { cn } from "@/lib/utils";

/* ── Initials fallback ──────────────────────────────────────
   Used when the native icon API call returns nothing.
   Maps bundle-ID / app-name fragments to a consistent
   background/foreground pair so the fallback looks intentional.
─────────────────────────────────────────────────────────── */
interface ToneEntry {
  aliases: string[];
  tone: string;
}

const toneRegistry: ToneEntry[] = [
  { aliases: ["ghostty", "commithellh", "commitchellh"], tone: "ghostty" },
  { aliases: ["warp", "devwarp"], tone: "warp" },
  { aliases: ["iterm", "googlecode"], tone: "iterm" },
  { aliases: ["appleterminal", "terminal"], tone: "terminal" },
  { aliases: ["vscode", "microsoft", "visualstudio"], tone: "code" },
  { aliases: ["cursor", "todesktop"], tone: "cursor" },
  { aliases: ["zed", "devzed"], tone: "code" },
  { aliases: ["chrome", "google"], tone: "chrome" },
  { aliases: ["arc", "thebrowser"], tone: "arc" },
  { aliases: ["safari", "applesafari"], tone: "safari" },
  { aliases: ["firefox", "mozilla"], tone: "firefox" },
  { aliases: ["finder", "applefinder"], tone: "finder" },
  { aliases: ["slack", "tinyspeck"], tone: "slack" },
  { aliases: ["notion"], tone: "notion" },
  { aliases: ["granola"], tone: "granola" },
  { aliases: ["orbstack", "kdrag0n", "macvirt"], tone: "orbstack" },
  { aliases: ["docker"], tone: "orbstack" },
  { aliases: ["quicktime", "quicktimeplayer"], tone: "quicktime" },
  { aliases: ["preview", "applepreview"], tone: "preview" },
];

const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");

const resolveTone = (...values: Array<string | undefined>): string => {
  const candidates = values.flatMap((v) => (v ? [norm(v)] : []));
  for (const entry of toneRegistry) {
    if (entry.aliases.some((alias) =>
      candidates.some((c) => c === norm(alias) || c.includes(norm(alias)))
    )) {
      return entry.tone;
    }
  }
  return "default";
};

const initials = (displayName: string): string => {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
};

/* ── AppLogo ─────────────────────────────────────────────── */
export function AppLogo({
  appIdentifier,
  appDisplayName,
  title,
  size = "md",
}: {
  appIdentifier: string;
  appDisplayName: string;
  title?: string;
  size?: "sm" | "md" | "lg";
}) {
  const [iconFailed, setIconFailed] = useState(false);

  const sizeClass = size === "sm" ? "app-logo-sm" : size === "lg" ? "app-logo-lg" : "";
  const tone = resolveTone(appIdentifier, appDisplayName, title);

  // Prefer native macOS icon via server endpoint
  const iconSrc =
    appIdentifier || appDisplayName
      ? `/api/icon?bundleId=${encodeURIComponent(appIdentifier)}&appName=${encodeURIComponent(appDisplayName || title || "")}`
      : null;

  if (iconSrc && !iconFailed) {
    return (
      <span
        className={cn("app-logo", sizeClass)}
        style={{ padding: 0, background: "transparent", border: "none", overflow: "hidden" }}
        aria-hidden="true"
      >
        <img
          src={iconSrc}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
          onError={() => setIconFailed(true)}
        />
      </span>
    );
  }

  // Fallback: colored initials box
  const label = appDisplayName || title || "?";
  return (
    <span
      className={cn(`app-logo app-logo-${tone}`, sizeClass)}
      aria-hidden="true"
    >
      <span>{initials(label)}</span>
    </span>
  );
}
