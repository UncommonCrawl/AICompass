import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

function validateRequiredEnv(mode, command) {
  if (command !== "build" || mode !== "production") return;
  const env = loadEnv(mode, process.cwd(), "");
  const submitEndpoint = (env.VITE_COMPASS_SUBMIT_ENDPOINT || "").trim();
  if (!submitEndpoint) {
    throw new Error(
      "Missing required env VITE_COMPASS_SUBMIT_ENDPOINT for production build.",
    );
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode, command }) => {
  validateRequiredEnv(mode, command);
  return {
    plugins: [react()],
  };
});
