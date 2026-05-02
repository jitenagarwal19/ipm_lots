import fs from "node:fs";
import util from "node:util";

const logFile = process.env.BACKEND_LOG_FILE;

/**
 * Always writes to **stderr** (and optionally BACKEND_LOG_FILE) so logs show up even when
 * stdout is fully buffered (non-TTY / piped IDE terminals).
 */
export function serverLog(...args: unknown[]): void {
  const line = `[${new Date().toISOString()}] ${util.format(...args)}\n`;
  try {
    process.stderr.write(line);
  } catch {
    // ignore
  }
  if (logFile) {
    try {
      fs.appendFileSync(logFile, line, "utf8");
    } catch {
      // ignore
    }
  }
}
