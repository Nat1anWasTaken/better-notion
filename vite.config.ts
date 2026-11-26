import { defineConfig } from "vite";
import monkey from "vite-plugin-monkey";

const releaseBase = "https://github.com/Nat1anWasTaken/better-notion/releases/latest/download";

export default defineConfig({
  plugins: [
    monkey({
      entry: "src/main.ts",
      userscript: {
        name: "Better Notion",
        namespace: "https://github.com/Nat1anWasTaken/better-notion",
        description: "Personal tweaks for Notion",
        author: "Nat1anWasTaken",
        match: ["https://app.notion.com/*", "https://www.notion.so/*"],
        "run-at": "document-start",
        updateURL: `${releaseBase}/better-notion.meta.js`,
        downloadURL: `${releaseBase}/better-notion.user.js`,
      },
      build: {
        fileName: "better-notion.user.js",
        metaFileName: true,
      },
    }),
  ],
});
