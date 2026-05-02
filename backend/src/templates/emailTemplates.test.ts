import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getTestRequestEmailTemplate } from "./emailTemplates";

describe("emailTemplates", () => {
  it("includes lot and lab in HTML body", () => {
    const html = getTestRequestEmailTemplate("LOT-99", "Acme Lab", "tid");
    assert.ok(html.includes("LOT-99"));
    assert.ok(html.includes("Acme Lab"));
    assert.ok(html.includes("tid"));
  });
});
