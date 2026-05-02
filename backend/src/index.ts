import dotenv from "dotenv";
import { validateProductionEnv } from "./lib/validateEnv";
import { serverLog } from "./lib/serverLog";
import { createApp } from "./app";
import path from "path";

dotenv.config({ override: true });

validateProductionEnv();

serverLog("BOOT IPM backend loading pid=%s cwd=%s", process.pid, process.cwd());

const app = createApp();
const port = process.env.PORT || 4000;

app.listen(port as number, "0.0.0.0", () => {
  serverLog("Listening http://0.0.0.0:%s  health=GET /health  debug=GET /api/debug/ready", port);
  if (!process.stderr.isTTY) {
    serverLog(
      "Tip: stdout/stderr may be fully buffered in this environment. Set BACKEND_LOG_FILE=%s for a guaranteed on-disk trace.",
      path.join(process.cwd(), "backend-debug.log")
    );
  }
});

export { db } from "./lib/db";
