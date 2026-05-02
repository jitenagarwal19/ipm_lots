import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Request, Response } from "express";
import { requestIdMiddleware } from "./requestId";

describe("requestIdMiddleware", () => {
  it("uses X-Request-Id when provided", async () => {
    const req = {
      headers: { "x-request-id": "  client-id-99  " },
    } as unknown as Request;
    let captured = "";
    const res = {
      setHeader: (name: string, value: string) => {
        assert.equal(name, "X-Request-Id");
        captured = value;
      },
    } as unknown as Response;
    await new Promise<void>((resolve) => {
      requestIdMiddleware(req, res, () => {
        assert.equal(req.requestId, "client-id-99");
        assert.equal(captured, "client-id-99");
        resolve();
      });
    });
  });

  it("generates UUID when header missing", async () => {
    const req = { headers: {} } as unknown as Request;
    const res = {
      setHeader: (_n: string, v: string) => {
        assert.ok(v.length > 10);
      },
    } as unknown as Response;
    await new Promise<void>((resolve) => {
      requestIdMiddleware(req, res, () => {
        assert.ok(typeof req.requestId === "string");
        resolve();
      });
    });
  });
});
