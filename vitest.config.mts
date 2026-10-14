import path from "node:path";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

/** Identifica la base (host sin "-pooler" + nombre): pooled y directa de la misma base coinciden. */
function baseDe(url: string | undefined) {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return `${u.hostname.replace("-pooler.", ".")}:${u.port || 5432}${u.pathname}`;
  } catch {
    return url;
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  if (!env.TEST_DATABASE_URL) {
    throw new Error("Falta TEST_DATABASE_URL en .env (ver .env.example)");
  }
  const baseTest = baseDe(env.TEST_DATABASE_URL);
  if (baseTest === baseDe(env.DATABASE_URL) || baseTest === baseDe(env.DIRECT_URL)) {
    throw new Error("TEST_DATABASE_URL debe apuntar a otra base que DATABASE_URL: los tests vacían la base");
  }

  return {
    plugins: [react()],
    resolve: { alias: { "@": path.resolve(import.meta.dirname, ".") } },
    test: {
      environment: "node",
      include: ["tests/**/*.test.{ts,tsx}"],
      globalSetup: ["./tests/global-setup.ts"],
      setupFiles: ["./tests/setup.ts"],
      // Los tests de integración comparten la base de test: se ejecutan de a un archivo.
      fileParallelism: false,
      testTimeout: 20000,
      env: {
        DATABASE_URL: env.TEST_DATABASE_URL,
        DIRECT_URL: env.TEST_DIRECT_URL || env.TEST_DATABASE_URL,
        JWT_SECRET: env.JWT_SECRET || "secreto-solo-para-tests-0123456789-abcdef",
      },
    },
  };
});
