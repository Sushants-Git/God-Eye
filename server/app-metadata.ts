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
  /* ── Terminals ── */
  {
    aliases: ["ghostty", "com.mitchellh.ghostty", "commitchellhghostty"],
    displayName: "Ghostty",
    identifier: "com.mitchellh.ghostty",
    description: "GPU-accelerated terminal emulator focused on speed, tabs, and modern shell workflows."
  },
  {
    aliases: ["warp", "dev.warp.Warp-Stable", "devwarpwarpstable", "warpterminal"],
    displayName: "Warp",
    identifier: "dev.warp.Warp-Stable",
    description: "Modern terminal with blocks, command history, and AI-assisted shell workflows."
  },
  {
    aliases: ["iterm", "iterm2", "com.googlecode.iterm2", "itermap", "comgooglecodeiterm2"],
    displayName: "iTerm",
    identifier: "com.googlecode.iterm2",
    description: "Feature-rich macOS terminal emulator commonly used for developer shells and multiplexed sessions."
  },
  {
    aliases: ["appleterminal", "terminal", "com.apple.Terminal", "comappleterminal"],
    displayName: "Terminal",
    identifier: "com.apple.Terminal",
    description: "Default macOS terminal app used for command-line shells and scripts."
  },
  {
    aliases: ["kitty", "net.kovidgoyal.kitty"],
    displayName: "Kitty",
    identifier: "net.kovidgoyal.kitty",
    description: "GPU-based terminal emulator with tiling, ligatures, and extensible config."
  },
  {
    aliases: ["alacritty", "org.alacritty"],
    displayName: "Alacritty",
    identifier: "org.alacritty",
    description: "Minimal GPU-accelerated terminal emulator."
  },

  /* ── Code editors / IDEs ── */
  {
    aliases: ["cursor", "com.todesktop.230313mzl4w4u92", "comtodesktop230313mzl4w4u92"],
    displayName: "Cursor",
    identifier: "com.todesktop.230313mzl4w4u92",
    description: "AI-native code editor based on VS Code, used for editing codebases and chatting with coding agents."
  },
  {
    aliases: ["code", "visualstudiocode", "vscode", "com.microsoft.VSCode", "commicrosoftvscode"],
    displayName: "VS Code",
    identifier: "com.microsoft.VSCode",
    description: "Source code editor used for application development, terminals, and repository navigation."
  },
  {
    aliases: ["xcode", "com.apple.dt.Xcode", "comappleDtXcode"],
    displayName: "Xcode",
    identifier: "com.apple.dt.Xcode",
    description: "Apple IDE for iOS, macOS, and Swift development."
  },
  {
    aliases: ["zed", "dev.zed.Zed", "devzedZed"],
    displayName: "Zed",
    identifier: "dev.zed.Zed",
    description: "High-performance collaborative code editor built in Rust."
  },
  {
    aliases: ["intellij", "com.jetbrains.intellij", "comjetbrainsintellijidea"],
    displayName: "IntelliJ IDEA",
    identifier: "com.jetbrains.intellij",
    description: "JetBrains IDE for Java, Kotlin, and enterprise development."
  },

  /* ── Browsers ── */
  {
    aliases: ["chrome", "googlechrome", "com.google.Chrome", "comgooglechrome"],
    displayName: "Chrome",
    identifier: "com.google.Chrome",
    description: "Web browser commonly used for local app testing, docs, dashboards, and devtools."
  },
  {
    aliases: ["arc", "company.thebrowser.Browser", "companythebrowserbrowser"],
    displayName: "Arc",
    identifier: "company.thebrowser.Browser",
    description: "Chromium-based browser often used for dev tabs, tools, and workspace-style browsing."
  },
  {
    aliases: ["safari", "com.apple.Safari", "comapplesafari"],
    displayName: "Safari",
    identifier: "com.apple.Safari",
    description: "macOS web browser used for browsing, debugging sites, and previewing local apps."
  },
  {
    aliases: ["firefox", "org.mozilla.firefox", "orgmozillafirefox"],
    displayName: "Firefox",
    identifier: "org.mozilla.firefox",
    description: "Open-source web browser by Mozilla, commonly used for dev and privacy-focused browsing."
  },
  {
    aliases: ["brave", "com.brave.Browser", "combravebrowser"],
    displayName: "Brave",
    identifier: "com.brave.Browser",
    description: "Privacy-focused Chromium-based browser."
  },

  /* ── Productivity / Notes ── */
  {
    aliases: ["finder", "com.apple.finder", "comapplefinder"],
    displayName: "Finder",
    identifier: "com.apple.finder",
    description: "macOS file manager used for navigating files, folders, and mounted volumes."
  },
  {
    aliases: ["slack", "com.tinyspeck.slackmacgap", "comtinyspeckslackmacgap"],
    displayName: "Slack",
    identifier: "com.tinyspeck.slackmacgap",
    description: "Team chat client used for channels, notifications, and project coordination."
  },
  {
    aliases: ["notion", "notion.id", "notionid"],
    displayName: "Notion",
    identifier: "notion.id",
    description: "Knowledge base and notes app used for documents, task tracking, and project planning."
  },
  {
    aliases: ["granola", "io.granola.app", "iogranola"],
    displayName: "Granola",
    identifier: "io.granola.app",
    description: "AI-powered meeting notes and conversation capture app."
  },
  {
    aliases: ["obsidian", "md.obsidian", "mdobsidian"],
    displayName: "Obsidian",
    identifier: "md.obsidian",
    description: "Markdown knowledge base with linked notes and graph view."
  },
  {
    aliases: ["bear", "net.shinyfrog.bear", "netshinyfrogbear"],
    displayName: "Bear",
    identifier: "net.shinyfrog.bear",
    description: "Markdown note-taking app for macOS and iOS."
  },
  {
    aliases: ["linear", "com.linear", "comlinear"],
    displayName: "Linear",
    identifier: "com.linear",
    description: "Issue tracking and project management tool for software teams."
  },
  {
    aliases: ["discord", "com.hnc.Discord", "comhncdiscord"],
    displayName: "Discord",
    identifier: "com.hnc.Discord",
    description: "Chat platform used for team and community communication."
  },

  /* ── Design ── */
  {
    aliases: ["figma", "com.figma.Desktop", "comfigmadesktop"],
    displayName: "Figma",
    identifier: "com.figma.Desktop",
    description: "Collaborative UI design and prototyping tool."
  },

  /* ── Dev tools ── */
  {
    aliases: ["orbstack", "dev.kdrag0n.MacVirt", "devkdrag0nmacvirt", "com.orbstack.OrbStack", "comorbstackorbstack"],
    displayName: "OrbStack",
    identifier: "dev.kdrag0n.MacVirt",
    description: "Fast, lightweight container and Linux VM manager for macOS."
  },
  {
    aliases: ["docker", "com.docker.Docker"],
    displayName: "Docker",
    identifier: "com.docker.Docker",
    description: "Container platform for building, running, and deploying containerized apps."
  },
  {
    aliases: ["tableplus", "com.tinyapp.TablePlus", "comtinyappTablePlus"],
    displayName: "TablePlus",
    identifier: "com.tinyapp.TablePlus",
    description: "GUI database client for Postgres, MySQL, SQLite, and more."
  },
  {
    aliases: ["postman", "com.postmanlabs.mac", "compostmanlabsmac"],
    displayName: "Postman",
    identifier: "com.postmanlabs.mac",
    description: "API testing and development platform."
  },
  {
    aliases: ["insomnia", "com.insomnia.app"],
    displayName: "Insomnia",
    identifier: "com.insomnia.app",
    description: "REST and GraphQL API client."
  },

  /* ── Media / Creative ── */
  {
    aliases: ["quicktimeplayer", "quicktime", "com.apple.QuickTimePlayerX", "comapplequicktimeplayerx"],
    displayName: "QuickTime Player",
    identifier: "com.apple.QuickTimePlayerX",
    description: "macOS media player for video, audio, and screen recording."
  },
  {
    aliases: ["preview", "com.apple.Preview", "comapplepreview"],
    displayName: "Preview",
    identifier: "com.apple.Preview",
    description: "macOS PDF and image viewer with annotation support."
  },
  {
    aliases: ["vlc", "org.videolan.vlc", "orgvideolan"],
    displayName: "VLC",
    identifier: "org.videolan.vlc",
    description: "Open-source media player for video and audio files."
  },
  {
    aliases: ["spotify", "com.spotify.client", "comspotifyclient"],
    displayName: "Spotify",
    identifier: "com.spotify.client",
    description: "Music and podcast streaming service."
  },
  {
    aliases: ["bambustudio", "bambu", "com.bambulab.bambu-studio", "com.bambulab.BambuStudio"],
    displayName: "BambuStudio",
    identifier: "com.bambulab.BambuStudio",
    description: "3D printing slicer and project manager for Bambu Lab printers."
  },
  {
    aliases: ["blender", "org.blenderfoundation.blender"],
    displayName: "Blender",
    identifier: "org.blenderfoundation.blender",
    description: "Open-source 3D creation suite for modeling, rendering, and animation."
  },

  /* ── System ── */
  {
    aliases: ["systempreferences", "systemsettings", "com.apple.systempreferences", "com.apple.SystemPreferences"],
    displayName: "System Settings",
    identifier: "com.apple.SystemPreferences",
    description: "macOS system settings and preferences panel."
  },
  {
    aliases: ["activitymonitor", "com.apple.ActivityMonitor", "comappleactivitymonitor"],
    displayName: "Activity Monitor",
    identifier: "com.apple.ActivityMonitor",
    description: "macOS process and resource usage monitor."
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
