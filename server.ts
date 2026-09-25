import { createServer } from "node:http";
import { betterAuth } from "better-auth";
import { toNodeHandler } from "better-auth/node";
import { jwt } from "better-auth/plugins";
import { expo } from "@better-auth/expo";
import { createJazzSession } from "jazz-tools/backend";
import { jazzAdapter } from "jazz-tools/better-auth-adapter";
import { app } from "./schema";
import permissions from "./permissions";
const baseURL = "http://127.0.0.1:3005";
let backend: ReturnType<typeof createJazzSession> | undefined;
async function db() {
  backend ??= createJazzSession({
    app,
    permissions,
    appId: "019a0000-0000-7000-8000-000000000056",
    serverUrl: "http://127.0.0.1:1625",
    env: "dev",
    driver: { type: "memory" },
    initial: { backendSecret: "local-repro-backend" },
    jwksUrl: `${baseURL}/api/auth/jwks`,
    jwtIssuer: baseURL,
    jwtAudience: baseURL,
  });
  const snapshot = (await backend).getSnapshot();
  if (!snapshot.client) throw snapshot.error ?? new Error("Backend not ready");
  return snapshot.client.db;
}
const auth = betterAuth({
  baseURL,
  secret: "local-repro-only-secret-do-not-deploy",
  emailAndPassword: { enabled: true },
  trustedOrigins: [baseURL, "jazztickrepro://", "exp://", "exp://**"],
  database: jazzAdapter({ db, schema: app.wasmSchema }),
  plugins: [expo(), jwt({ jwks: { keyPairConfig: { alg: "ES256" } } })],
});
createServer(toNodeHandler(auth)).listen(3005, "127.0.0.1", () =>
  console.log("Better Auth ready on localhost:3005"),
);
