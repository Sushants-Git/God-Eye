const normalizeToken = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const logoRegistry = [
  { aliases: ["ghostty", "commitchellhghostty"], glyph: "G", tone: "ghostty" },
  { aliases: ["devwarpwarpstable", "warp", "warpterminal"], glyph: "W", tone: "warp" },
  { aliases: ["comgooglecodeiterm2", "iterm", "iterm2"], glyph: "i>", tone: "iterm" },
  { aliases: ["comappleterminal", "appleterminal", "terminal"], glyph: ">", tone: "terminal" },
  { aliases: ["commicrosoftvscode", "vscode", "visualstudiocode", "code"], glyph: "</>", tone: "code" },
  { aliases: ["comtodesktop230313mzl4w4u92", "cursor"], glyph: "C", tone: "cursor" },
  { aliases: ["comgooglechrome", "chrome", "googlechrome"], glyph: "◎", tone: "chrome" },
  { aliases: ["companythebrowserbrowser", "arc"], glyph: "A", tone: "arc" },
  { aliases: ["comapplesafari", "safari"], glyph: "S", tone: "safari" },
  { aliases: ["comapplefinder", "finder"], glyph: "F", tone: "finder" },
  { aliases: ["comtinyspeckslackmacgap", "slack"], glyph: "S", tone: "slack" },
  { aliases: ["notionid", "notion"], glyph: "N", tone: "notion" }
];

const resolveLogo = (...values: Array<string | undefined>): { glyph: string; tone: string } => {
  const candidates = values.flatMap((value) => (value ? [normalizeToken(value)] : []));
  const match = logoRegistry.find((entry) =>
    entry.aliases.some((alias) =>
      candidates.some((candidate) => candidate === alias || candidate.includes(alias))
    )
  );

  if (match) {
    return { glyph: match.glyph, tone: match.tone };
  }

  const fallback = values.find((value) => value?.trim())?.trim() ?? "?";
  return {
    glyph: fallback.slice(0, 2).toUpperCase(),
    tone: "default"
  };
};

export const AppLogo = ({
  appIdentifier,
  appDisplayName,
  title,
  size = "md"
}: {
  appIdentifier: string;
  appDisplayName: string;
  title?: string;
  size?: "sm" | "md" | "lg";
}) => {
  const logo = resolveLogo(appIdentifier, appDisplayName, title);

  return (
    <span className={`app-logo app-logo-${logo.tone} app-logo-${size}`} aria-hidden="true">
      <span>{logo.glyph}</span>
    </span>
  );
};
