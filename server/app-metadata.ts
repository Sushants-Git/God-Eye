interface KnownApp {
  aliases: string[];
  displayName: string;
  identifier: string;
  description: string;
}

const normalizeToken = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const knownApps: KnownApp[] = [
  {
    aliases: ["ghostty", "com.mitchellh.ghostty"],
    displayName: "Ghostty",
    identifier: "com.mitchellh.ghostty",
    description: "GPU-accelerated terminal emulator focused on speed, tabs, and modern shell workflows."
  },
  {
    aliases: ["warp", "dev.warp.Warp-Stable", "warpterminal"],
    displayName: "Warp",
    identifier: "dev.warp.Warp-Stable",
    description: "Modern terminal with blocks, command history, and AI-assisted shell workflows."
  },
  {
    aliases: ["iterm", "iterm2", "com.googlecode.iterm2", "itermap"],
    displayName: "iTerm",
    identifier: "com.googlecode.iterm2",
    description: "Feature-rich macOS terminal emulator commonly used for developer shells and multiplexed sessions."
  },
  {
    aliases: ["appleterminal", "terminal", "com.apple.Terminal"],
    displayName: "Terminal",
    identifier: "com.apple.Terminal",
    description: "Default macOS terminal app used for command-line shells and scripts."
  },
  {
    aliases: ["cursor", "com.todesktop.230313mzl4w4u92"],
    displayName: "Cursor",
    identifier: "com.todesktop.230313mzl4w4u92",
    description: "AI-native code editor based on VS Code, used for editing codebases and chatting with coding agents."
  },
  {
    aliases: ["code", "visualstudiocode", "vscode", "com.microsoft.VSCode"],
    displayName: "VS Code",
    identifier: "com.microsoft.VSCode",
    description: "Source code editor used for application development, terminals, and repository navigation."
  },
  {
    aliases: ["chrome", "googlechrome", "com.google.Chrome"],
    displayName: "Chrome",
    identifier: "com.google.Chrome",
    description: "Web browser commonly used for local app testing, docs, dashboards, and devtools."
  },
  {
    aliases: ["arc", "company.thebrowser.Browser"],
    displayName: "Arc",
    identifier: "company.thebrowser.Browser",
    description: "Chromium-based browser often used for dev tabs, tools, and workspace-style browsing."
  },
  {
    aliases: ["safari", "com.apple.Safari"],
    displayName: "Safari",
    identifier: "com.apple.Safari",
    description: "macOS web browser used for browsing, debugging sites, and previewing local apps."
  },
  {
    aliases: ["finder", "com.apple.finder"],
    displayName: "Finder",
    identifier: "com.apple.finder",
    description: "macOS file manager used for navigating files, folders, and mounted volumes."
  },
  {
    aliases: ["slack", "com.tinyspeck.slackmacgap"],
    displayName: "Slack",
    identifier: "com.tinyspeck.slackmacgap",
    description: "Team chat client used for channels, notifications, and project coordination."
  },
  {
    aliases: ["notion", "notion.id"],
    displayName: "Notion",
    identifier: "notion.id",
    description: "Knowledge base and notes app used for documents, task tracking, and project planning."
  }
];

const matchKnownApp = (...values: Array<string | undefined>): KnownApp | null => {
  const normalized = values
    .flatMap((value) => (value ? [normalizeToken(value)] : []))
    .filter(Boolean);

  if (normalized.length === 0) {
    return null;
  }

  return (
    knownApps.find((app) =>
      app.aliases.some((alias) => {
        const normalizedAlias = normalizeToken(alias);
        return normalized.some(
          (candidate) => candidate === normalizedAlias || candidate.includes(normalizedAlias)
        );
      })
    ) ?? null
  );
};

export const resolveAppMetadata = (input: {
  terminalProgram?: string;
  appIdentifier?: string;
  appDisplayName?: string;
  appDescription?: string;
  title?: string;
}): { appIdentifier: string; appDisplayName: string; appDescription: string } => {
  const knownApp = matchKnownApp(
    input.appIdentifier,
    input.appDisplayName,
    input.terminalProgram,
    input.title
  );

  const appDisplayName =
    input.appDisplayName?.trim() ||
    knownApp?.displayName ||
    input.terminalProgram?.trim() ||
    input.title?.trim() ||
    "Window";

  const appIdentifier =
    input.appIdentifier?.trim() ||
    knownApp?.identifier ||
    normalizeToken(input.terminalProgram || input.appDisplayName || appDisplayName);

  const appDescription =
    input.appDescription?.trim() ||
    knownApp?.description ||
    `${appDisplayName} window captured by Terminal Scout.`;

  return {
    appIdentifier,
    appDisplayName,
    appDescription
  };
};
