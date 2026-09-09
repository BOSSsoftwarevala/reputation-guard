import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig(async ({ command }) => {
  const plugins = [
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    // Redirect TanStack Start's bundled server entry to src/server.ts
    // (our SSR error wrapper).
    tanstackStart({ server: { entry: "server" } }),
    viteReact(),
  ];

  // Only needed for the production build: emits a plain Node server instead
  // of the nitro default (a Cloudflare Workers bundle), since this app is
  // self-hosted on a VPS behind nginx.
  if (command === "build") {
    const { nitro } = await import("nitro/vite");
    plugins.push(nitro({ preset: "node-server" }));
  }

  return { plugins };
});
