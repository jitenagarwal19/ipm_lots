import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { serverLog } from "./serverLog";

describe("serverLog", () => {
  const orig = process.env.BACKEND_LOG_FILE;

  afterEach(() => {
    if (orig === undefined) delete process.env.BACKEND_LOG_FILE;
    else process.env.BACKEND_LOG_FILE = orig;
  });

  it("writes to BACKEND_LOG_FILE when set", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "srvlog-"));
    const file = path.join(dir, "out.log");
    process.env.BACKEND_LOG_FILE = file;
    serverLog("hello %s", "world");
    const text = fs.readFileSync(file, "utf8");
    assert.ok(text.includes("hello world"));
    fs.rmSync(dir, { recursive: true });
  });

  it("does not throw when stderr.write fails", () => {
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = () => {
      throw new Error("stderr broken");
    };
    try {
      serverLog("still ok");
    } finally {
      process.stderr.write = orig;
    }
  });

  it("does not throw when appendFileSync fails", () => {
    process.env.BACKEND_LOG_FILE = "/tmp/will-fail-serverlog";
    const orig = fs.appendFileSync;
    fs.appendFileSync = () => {
      throw new Error("disk full");
    };
    try {
      serverLog("logged");
    } finally {
      fs.appendFileSync = orig;
    }
  });
});
