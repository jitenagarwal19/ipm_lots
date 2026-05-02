"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.serverLog = serverLog;
const node_fs_1 = __importDefault(require("node:fs"));
const node_util_1 = __importDefault(require("node:util"));
const logFile = process.env.BACKEND_LOG_FILE;
/**
 * Always writes to **stderr** (and optionally BACKEND_LOG_FILE) so logs show up even when
 * stdout is fully buffered (non-TTY / piped IDE terminals).
 */
function serverLog(...args) {
    const line = `[${new Date().toISOString()}] ${node_util_1.default.format(...args)}\n`;
    try {
        process.stderr.write(line);
    }
    catch (_a) {
        // ignore
    }
    if (logFile) {
        try {
            node_fs_1.default.appendFileSync(logFile, line, "utf8");
        }
        catch (_b) {
            // ignore
        }
    }
}
