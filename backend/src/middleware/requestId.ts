import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";

/**
 * Assigns a stable id for one HTTP request so every log line can be tied together.
 * Honors incoming X-Request-Id from the client when present.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const raw = req.headers["x-request-id"];
  const id =
    typeof raw === "string" && raw.trim().length > 0
      ? raw.trim().slice(0, 128)
      : randomUUID();
  req.requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
}
