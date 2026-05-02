import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  inferSourceType,
  mapMoleculeResult,
  normalizeFilename,
  normalizeReports,
  parseJson,
} from "./lots";

describe("lots helpers", () => {
  it("parseJson", () => {
    assert.equal(parseJson(null), null);
    assert.deepEqual(parseJson('{"a":1}'), { a: 1 });
    assert.equal(parseJson("bad"), null);
  });

  it("normalizeReports", () => {
    assert.deepEqual(normalizeReports({ reports: [{ lotNumber: "L1" }] }), [{ lotNumber: "L1" }]);
    assert.deepEqual(normalizeReports([{ x: 1 }]), [{ x: 1 }]);
    assert.deepEqual(normalizeReports({ lotNumber: "L", moleculeResults: [] }), [{ lotNumber: "L", moleculeResults: [] }]);
    assert.deepEqual(normalizeReports({}), []);
  });

  it("normalizeFilename", () => {
    assert.equal(normalizeFilename("  Foo.PDF  "), "foo.pdf");
  });

  it("inferSourceType", () => {
    assert.equal(inferSourceType({ sourceType: "ATTACHMENT" }, null), "ATTACHMENT");
    assert.equal(inferSourceType({ sourceAttachmentFilename: "x.pdf" }, null), "ATTACHMENT");
    assert.equal(inferSourceType({}, null), "EMAIL_BODY");
  });

  it("mapMoleculeResult maps fields", () => {
    const row = mapMoleculeResult("rid", {
      moleculeName: "Cu",
      numericResult: 1.5,
      isDetected: true,
    });
    assert.equal(row.lab_report_id, "rid");
    assert.equal(row.molecule_name, "Cu");
    assert.equal(row.numeric_result, 1.5);
    assert.equal(row.is_detected, true);
  });
});
