import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseJsonField, serializeReport } from "./reviews";

describe("reviews serialization", () => {
  it("parseJsonField returns null for empty / invalid", () => {
    assert.equal(parseJsonField(null), null);
    assert.equal(parseJsonField(""), null);
    assert.equal(parseJsonField("{"), null);
  });

  it("parseJsonField parses JSON", () => {
    assert.deepEqual(parseJsonField('{"a":1}'), { a: 1 });
  });

  it("serializeReport merges parsed JSON fields", () => {
    const out = serializeReport({
      id: "r1",
      metadata_json: '{"x":true}',
      results_json: '{"summary":"ok"}',
      raw_ai_json: "[1]",
    });
    assert.equal(out.id, "r1");
    assert.deepEqual(out.metadata, { x: true });
    assert.deepEqual(out.results, { summary: "ok" });
    assert.deepEqual(out.rawAi, [1]);
  });
});
