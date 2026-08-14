import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";

const buildId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const buildVersionPlugin: Plugin = {
  name: "quiz-build-version",
  transformIndexHtml(html: string) {
    return html.replace(
      "<head>",
      `<head>\n    <meta name="quiz-build-id" content="${buildId}" />`,
    );
  },
};

const precacheManifestPlugin: Plugin = {
  name: "quiz-precache-manifest",
  apply: "build",
  generateBundle(_options, bundle) {
    const files = Object.keys(bundle)
      .filter((fileName) => fileName.startsWith("assets/") && !fileName.endsWith(".map"))
      .sort();

    this.emitFile({
      type: "asset",
      fileName: "precache-manifest.json",
      source: `${JSON.stringify({ version: 1, files }, null, 2)}\n`,
    });
  },
};

export default defineConfig(({ mode }) => ({
  base: mode === "native" ? "./" : "/quiz/",
  plugins: [react(), buildVersionPlugin, precacheManifestPlugin],
  define: {
    __QUIZ_BUILD_ID__: JSON.stringify(buildId),
  },
}));
