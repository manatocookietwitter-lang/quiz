import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const buildId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const buildVersionPlugin = {
  name: "quiz-build-version",
  transformIndexHtml(html: string) {
    return html.replace(
      "<head>",
      `<head>\n    <meta name="quiz-build-id" content="${buildId}" />`,
    );
  },
};

export default defineConfig({
  base: "/quiz/",
  plugins: [react(), buildVersionPlugin],
  define: {
    __QUIZ_BUILD_ID__: JSON.stringify(buildId),
  },
});
