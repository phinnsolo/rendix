import { execSync } from "node:child_process";
import { loadEnv } from "vite";

/** Aplica las migraciones a la base de test antes de correr la suite. */
export default function setup() {
  const env = loadEnv("test", process.cwd(), "");
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    // DIRECT_URL también se sobreescribe: Prisma Migrate usa directUrl, no DATABASE_URL.
    env: {
      ...process.env,
      DATABASE_URL: env.TEST_DATABASE_URL,
      DIRECT_URL: env.TEST_DIRECT_URL || env.TEST_DATABASE_URL,
    },
  });
}
