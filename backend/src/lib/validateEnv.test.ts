import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { validateProductionEnv } from "./validateEnv";

describe("validateProductionEnv", () => {
  const backup = { ...process.env };

  afterEach(() => {
    process.env = { ...backup };
  });

  it("no-ops when NODE_ENV is not production", () => {
    delete process.env.NODE_ENV;
    assert.doesNotThrow(() => validateProductionEnv());
  });

  it("throws when production and DATABASE_URL missing", () => {
    process.env.NODE_ENV = "production";
    delete process.env.DATABASE_URL;
    process.env.FRONTEND_URL = "http://localhost:3000";
    process.env.SERVICE_API_KEY = "k";
    assert.throws(() => validateProductionEnv(), /DATABASE_URL/);
  });

  it("throws when SERVICE_API_KEY missing (default API_REQUIRE_KEY)", () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://x";
    process.env.FRONTEND_URL = "http://localhost:3000";
    delete process.env.SERVICE_API_KEY;
    delete process.env.API_REQUIRE_KEY;
    assert.throws(() => validateProductionEnv(), /SERVICE_API_KEY/);
  });

  it("does not require SERVICE_API_KEY when API_REQUIRE_KEY=false", () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://x";
    process.env.FRONTEND_URL = "http://localhost:3000";
    process.env.API_REQUIRE_KEY = "false";
    delete process.env.SERVICE_API_KEY;
    assert.doesNotThrow(() => validateProductionEnv());
  });

  it("allows production without WEBHOOK_SECRET (warn path only)", () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://x";
    process.env.FRONTEND_URL = "http://localhost:3000";
    process.env.SERVICE_API_KEY = "k";
    delete process.env.WEBHOOK_SECRET;
    delete process.env.API_REQUIRE_KEY;
    assert.doesNotThrow(() => validateProductionEnv());
  });
});
