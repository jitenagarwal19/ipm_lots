import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { Request, Response } from "express";
import { apiKeyAuth } from "./apiKeyAuth";
import { webhookSecretAuth } from "./webhookSecret";

describe("apiKeyAuth", () => {
  const backup = { ...process.env };

  afterEach(() => {
    for (const k of Object.keys(process.env)) {
      if (!(k in backup)) delete process.env[k];
    }
    Object.assign(process.env, backup);
  });

  function mockReq(path: string, headers: Record<string, string | undefined> = {}): Request {
    return {
      path,
      headers: headers as Request["headers"],
    } as Request;
  }

  function mockRes() {
    const jsonCalls: unknown[] = [];
    const statusCalls: number[] = [];
    const res = {
      status(n: number) {
        statusCalls.push(n);
        return res;
      },
      json(body: unknown) {
        jsonCalls.push(body);
        return res;
      },
      _jsonCalls: jsonCalls,
      _statusCalls: statusCalls,
    };
    return res as Response & { _jsonCalls: unknown[]; _statusCalls: number[] };
  }

  const runNext = (middleware: typeof apiKeyAuth, req: Request, res: Response) =>
    new Promise<void>((resolve, reject) => {
      middleware(req, res, (err?: unknown) => {
        if (err) reject(err);
        else resolve();
      });
    });

  it("calls next when API key not required (development)", async () => {
    delete process.env.NODE_ENV;
    delete process.env.API_REQUIRE_KEY;
    await runNext(apiKeyAuth, mockReq("/api/tests"), mockRes());
  });

  it("returns 503 when production requires key but SERVICE_API_KEY unset", () => {
    process.env.NODE_ENV = "production";
    delete process.env.API_REQUIRE_KEY;
    delete process.env.SERVICE_API_KEY;
    const req = mockReq("/api/tests");
    const res = mockRes();
    let nextCalled = false;
    apiKeyAuth(req, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, false);
    assert.equal(res._statusCalls[0], 503);
  });

  it("allows webhooks path without key", async () => {
    process.env.NODE_ENV = "production";
    process.env.SERVICE_API_KEY = "secret";
    await runNext(apiKeyAuth, mockReq("/api/webhooks/zapier"), mockRes());
  });

  it("accepts Bearer token", async () => {
    process.env.NODE_ENV = "production";
    process.env.SERVICE_API_KEY = "secret";
    await runNext(
      apiKeyAuth,
      mockReq("/api/emails", { authorization: "Bearer secret" }),
      mockRes()
    );
  });

  it("accepts X-Api-Key", async () => {
    process.env.NODE_ENV = "production";
    process.env.SERVICE_API_KEY = "secret";
    await runNext(apiKeyAuth, mockReq("/api/emails", { "x-api-key": "secret" }), mockRes());
  });

  it("returns 401 on bad key", () => {
    process.env.NODE_ENV = "production";
    process.env.SERVICE_API_KEY = "secret";
    const req = mockReq("/api/emails", { authorization: "Bearer wrong" });
    const res = mockRes();
    apiKeyAuth(req, res, () => assert.fail("next"));
    assert.equal(res._statusCalls[0], 401);
  });
});

describe("webhookSecretAuth", () => {
  const backup = { ...process.env };

  afterEach(() => {
    for (const k of Object.keys(process.env)) {
      if (!(k in backup)) delete process.env[k];
    }
    Object.assign(process.env, backup);
  });

  function mockReq(headers: Record<string, string | undefined> = {}): Request {
    return { headers: headers as Request["headers"] } as Request;
  }

  function mockRes() {
    const calls: unknown[] = [];
    const res = {
      status(_n: number) {
        return res;
      },
      json(body: unknown) {
        calls.push(body);
        return res;
      },
      _calls: calls,
    };
    return res as Response & { _calls: unknown[] };
  }

  const runNext = (req: Request, res: Response) =>
    new Promise<void>((resolve, reject) => {
      webhookSecretAuth(req, res, (err?: unknown) => {
        if (err) reject(err);
        else resolve();
      });
    });

  it("allows without WEBHOOK_SECRET in development", async () => {
    delete process.env.NODE_ENV;
    delete process.env.WEBHOOK_SECRET;
    await runNext(mockReq(), mockRes());
  });

  it("returns 503 in production without WEBHOOK_SECRET", () => {
    process.env.NODE_ENV = "production";
    delete process.env.WEBHOOK_SECRET;
    const res = mockRes();
    let nextCalled = false;
    webhookSecretAuth(mockReq(), res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, false);
  });

  it("accepts Authorization Bearer secret", async () => {
    process.env.WEBHOOK_SECRET = "whsec";
    await runNext(mockReq({ authorization: "Bearer whsec" }), mockRes());
  });

  it("accepts X-Webhook-Secret", async () => {
    process.env.WEBHOOK_SECRET = "whsec";
    await runNext(mockReq({ "x-webhook-secret": "whsec" }), mockRes());
  });

  it("returns 401 on wrong secret", () => {
    process.env.WEBHOOK_SECRET = "whsec";
    const res = mockRes();
    webhookSecretAuth(mockReq({ authorization: "Bearer nope" }), res, () => assert.fail("next"));
    assert.ok(res._calls.length > 0);
  });
});
