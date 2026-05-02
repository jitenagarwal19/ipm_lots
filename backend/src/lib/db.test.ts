import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { db } from "./db";

describe("db", () => {
  it("exports shared prisma client", () => {
    assert.ok(db.prisma);
    assert.equal(typeof db.prisma.$disconnect, "function");
  });
});
