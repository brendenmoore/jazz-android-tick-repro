import { loadEnvFile } from "node:process";
import { spawn } from "node:child_process";
loadEnvFile(".credentials/cloud.env");
const env = { ...process.env };
for (const key of [
  "JAZZ_ADMIN_SECRET",
  "BACKEND_SECRET",
  "JAZZ_APP_ID",
  "JAZZ_SERVER_URL",
])
  delete env[key];
const child = spawn(
  "corepack",
  [
    "pnpm",
    "exec",
    "expo",
    "start",
    "--dev-client",
    "--localhost",
    "--port",
    "8097",
    "--clear",
  ],
  { stdio: "inherit", env },
);
child.on("exit", (code) => process.exit(code ?? 1));
