import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeReports } from "./openai";

describe("normalizeReports (OpenAI JSON)", () => {
  it("accepts top-level array", () => {
    assert.deepEqual(normalizeReports([{ a: 1 }]), [{ a: 1 }]);
  });

  it("unwraps reports array", () => {
    assert.deepEqual(normalizeReports({ reports: [{ lotNumber: "L1" }] }), [{ lotNumber: "L1" }]);
  });

  it("wraps legacy single object", () => {
    const one = { lotNumber: "L1", moleculeResults: [] };
    assert.deepEqual(normalizeReports(one), [one]);
  });

  it("returns empty for unusable payload", () => {
    assert.deepEqual(normalizeReports({}), []);
    assert.deepEqual(normalizeReports(null), []);
  });
});
