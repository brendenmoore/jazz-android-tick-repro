import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const filename = ".credentials/cloud.env";
if (existsSync(filename))
  throw new Error(
    "Cloud credentials already exist; reuse them instead of provisioning another app.",
  );
const response = await fetch(
  "https://v2.dashboard.jazz.tools/api/apps/generate",
  { method: "POST" },
);
if (!response.ok) throw new Error(`Provisioning failed: ${response.status}`);
const data = await response.json();
for (const key of ["appId", "adminSecret", "backendSecret"])
  if (typeof data[key] !== "string")
    throw new Error("Unexpected provisioning response");
const env = {
  EXPO_PUBLIC_JAZZ_APP_ID: data.appId,
  EXPO_PUBLIC_JAZZ_SERVER_URL: "https://v2.sync.jazz.tools/",
  JAZZ_APP_ID: data.appId,
  JAZZ_SERVER_URL: "https://v2.sync.jazz.tools/",
  JAZZ_ADMIN_SECRET: data.adminSecret,
  BACKEND_SECRET: data.backendSecret,
};
mkdirSync(".credentials", { recursive: true });
writeFileSync(
  filename,
  Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n") + "\n",
  { mode: 0o600 },
);
console.log(
  "Created a separate cloud test app. Credentials saved in ignored .credentials/cloud.env. Unclaimed apps expire after 14 days.",
);
const result = spawnSync(
  process.execPath,
  ["node_modules/jazz-tools/dist/cli.js", "deploy"],
  { env: { ...process.env, ...env }, stdio: "inherit" },
);
process.exitCode = result.status ?? 1;
