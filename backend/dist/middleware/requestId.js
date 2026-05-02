"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestIdMiddleware = requestIdMiddleware;
const node_crypto_1 = require("node:crypto");
/**
 * Assigns a stable id for one HTTP request so every log line can be tied together.
 * Honors incoming X-Request-Id from the client when present.
 */
function requestIdMiddleware(req, res, next) {
    const raw = req.headers["x-request-id"];
    const id = typeof raw === "string" && raw.trim().length > 0
        ? raw.trim().slice(0, 128)
        : (0, node_crypto_1.randomUUID)();
    req.requestId = id;
    res.setHeader("X-Request-Id", id);
    next();
}
