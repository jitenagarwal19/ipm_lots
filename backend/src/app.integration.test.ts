import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import request from "supertest";
import { createApp } from "./app";
import { db } from "./lib/db";
import type { PrismaClient } from "@prisma/client";
import {
  createStubPrisma,
  createWebhookPrisma,
  prismaLotDetail,
  prismaReviewsFlow,
  prismaTestDetail,
  prismaTrackedLabelsBlank,
} from "./test/mock-prisma";

describe("createApp HTTP", () => {
  let realPrisma: PrismaClient;

  beforeEach(() => {
    realPrisma = db.prisma;
    db.prisma = createStubPrisma();
  });

  afterEach(() => {
    db.prisma = realPrisma;
  });

  it("serves /health in production CORS mode", async () => {
    const prevNode = process.env.NODE_ENV;
    const prevFront = process.env.FRONTEND_URL;
    process.env.NODE_ENV = "production";
    process.env.FRONTEND_URL = "http://localhost:3000,https://app.example.com";
    try {
      const res = await request(createApp()).get("/health").set("Origin", "http://localhost:3000");
      assert.equal(res.status, 200);
    } finally {
      process.env.NODE_ENV = prevNode;
      process.env.FRONTEND_URL = prevFront;
    }
  });

  it("GET /health", async () => {
    const res = await request(createApp()).get("/health");
    assert.equal(res.status, 200);
    assert.equal(res.body?.status, "ok");
  });

  it("GET /api/debug/ready includes checks", async () => {
    const res = await request(createApp()).get("/api/debug/ready");
    assert.equal(res.status, 200);
    assert.ok(typeof res.body?.checks?.database === "boolean");
  });

  it("GET /api/tests returns JSON array", async () => {
    const res = await request(createApp()).get("/api/tests");
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });

  it("GET /api/settings/labs returns JSON array", async () => {
    const res = await request(createApp()).get("/api/settings/labs");
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });

  it("GET /api/reviews returns JSON array", async () => {
    const res = await request(createApp()).get("/api/reviews");
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });

  it("GET /api/emails returns JSON array", async () => {
    const res = await request(createApp()).get("/api/emails");
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });

  it("GET /api/ailogs returns JSON array", async () => {
    const res = await request(createApp()).get("/api/ailogs");
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });

  it("GET /api/lots/:id returns 404 when lot missing", async () => {
    const res = await request(createApp()).get("/api/lots/does-not-exist");
    assert.equal(res.status, 404);
  });

  it("POST /api/webhooks/zapier succeeds when test exists", async () => {
    db.prisma = createWebhookPrisma("tid-1");
    const res = await request(createApp())
      .post("/api/webhooks/zapier")
      .send({
        test_id: "tid-1",
        from_email: "lab@test.com",
        attachment_url: "https://example.com/r.pdf",
        message_id: "m1",
      });
    assert.equal(res.status, 200);
    assert.equal(res.body?.success, true);
  });

  it("POST /api/webhooks/zapier 404 when no matching test", async () => {
    const res = await request(createApp()).post("/api/webhooks/zapier").send({
      lot_number: "UNKNOWN-LOT",
    });
    assert.equal(res.status, 404);
  });

  it("GET /api/settings/products", async () => {
    const res = await request(createApp()).get("/api/settings/products");
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });

  it("GET /api/settings/system", async () => {
    const res = await request(createApp()).get("/api/settings/system");
    assert.equal(res.status, 200);
  });

  it("PUT /api/settings/system/my_key updates setting", async () => {
    const res = await request(createApp()).put("/api/settings/system/my_key").send({ value: "v" });
    assert.equal(res.status, 200);
  });

  it("GET /api/reviews serializes reports when data exists", async () => {
    db.prisma = prismaReviewsFlow("rx1");
    const res = await request(createApp()).get("/api/reviews");
    assert.equal(res.status, 200);
    assert.equal(res.body[0]?.metadata?.m, 1);
  });

  it("GET /api/reviews/:id returns one report", async () => {
    db.prisma = prismaReviewsFlow("rx2");
    const res = await request(createApp()).get("/api/reviews/rx2");
    assert.equal(res.status, 200);
    assert.equal(res.body.id, "rx2");
  });

  it("POST /api/reviews/:id/approve", async () => {
    db.prisma = prismaReviewsFlow("rx3");
    const res = await request(createApp()).post("/api/reviews/rx3/approve").send({ notes: "ok" });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });

  it("GET /api/tests/:id returns test detail", async () => {
    db.prisma = prismaTestDetail("tx1");
    const res = await request(createApp()).get("/api/tests/tx1");
    assert.equal(res.status, 200);
    assert.equal(res.body.id, "tx1");
  });

  it("GET /api/tests/:id returns 404 when missing", async () => {
    const res = await request(createApp()).get("/api/tests/missing-id");
    assert.equal(res.status, 404);
  });

  it("GET /api/settings/companies, variants, test-types", async () => {
    for (const path of ["/api/settings/companies", "/api/settings/variants", "/api/settings/test-types"]) {
      const res = await request(createApp()).get(path);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body));
    }
  });

  it("POST /api/settings/products creates product", async () => {
    const res = await request(createApp()).post("/api/settings/products").send({ name: "Prod-A" });
    assert.equal(res.status, 200);
    assert.equal(res.body.name, "Prod-A");
  });

  it("GET /api/lots/:id returns lot payload", async () => {
    db.prisma = prismaLotDetail("lot-99");
    const res = await request(createApp()).get("/api/lots/lot-99");
    assert.equal(res.status, 200);
    assert.equal(res.body.lot_number, "LOT-X");
  });

  it("POST /api/tests/fetch-emails 400 when Gmail labels not configured", async () => {
    const res = await request(createApp()).post("/api/tests/fetch-emails").send({});
    assert.equal(res.status, 400);
  });

  it("GET /api/emails/tracked empty when labels blank", async () => {
    db.prisma = prismaTrackedLabelsBlank();
    const res = await request(createApp()).get("/api/emails/tracked");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });

  it("GET /api/emails/tracked 500 when prisma fails", async () => {
    db.prisma = new Proxy(createStubPrisma(), {
      get(target, prop, receiver) {
        if (prop === "systemSetting") {
          return {
            findUnique: async () => {
              throw new Error("db");
            },
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as typeof db.prisma;
    const res = await request(createApp()).get("/api/emails/tracked");
    assert.equal(res.status, 500);
  });

  it("GET /api/reviews with status filter", async () => {
    db.prisma = prismaReviewsFlow("rx-filter");
    const res = await request(createApp()).get("/api/reviews?status=PENDING_REVIEW");
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });

  it("PUT /api/settings/products/:id", async () => {
    const res = await request(createApp()).put("/api/settings/products/mock-pid").send({ name: "Updated" });
    assert.equal(res.status, 200);
  });

  it("POST/PUT settings CRUD stubs", async () => {
    assert.equal((await request(createApp()).post("/api/settings/companies").send({ name: "Co1" })).status, 200);
    assert.equal((await request(createApp()).put("/api/settings/companies/c1").send({ name: "Co2" })).status, 200);
    assert.equal((await request(createApp()).post("/api/settings/test-types").send({ name: "T", country_standard: "EU" }))
      .status, 200);
    assert.equal((await request(createApp()).put("/api/settings/test-types/t1").send({ name: "T2", country_standard: "US" }))
      .status, 200);
    assert.equal((await request(createApp()).post("/api/settings/variants").send({ name: "V1" })).status, 200);
    assert.equal((await request(createApp()).put("/api/settings/variants/v1").send({ name: "V2" })).status, 200);
  });

  it("GET /api/tests 500 when prisma fails", async () => {
    db.prisma = new Proxy(createStubPrisma(), {
      get(target, prop, receiver) {
        if (prop === "test") {
          return {
            findMany: async () => {
              throw new Error("db down");
            },
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as typeof db.prisma;
    const res = await request(createApp()).get("/api/tests");
    assert.equal(res.status, 500);
  });

  it("GET /api/settings/labs 500 when prisma fails", async () => {
    db.prisma = new Proxy(createStubPrisma(), {
      get(target, prop, receiver) {
        if (prop === "lab") {
          return {
            findMany: async () => {
              throw new Error("db");
            },
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as typeof db.prisma;
    const res = await request(createApp()).get("/api/settings/labs");
    assert.equal(res.status, 500);
  });

  it("GET /api/reviews 500 when prisma fails", async () => {
    db.prisma = new Proxy(createStubPrisma(), {
      get(target, prop, receiver) {
        if (prop === "labReport") {
          return {
            findMany: async () => {
              throw new Error("db");
            },
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as typeof db.prisma;
    const res = await request(createApp()).get("/api/reviews");
    assert.equal(res.status, 500);
  });

  it("GET /api/emails 500 when prisma fails", async () => {
    db.prisma = new Proxy(createStubPrisma(), {
      get(target, prop, receiver) {
        if (prop === "email") {
          return {
            findMany: async () => {
              throw new Error("db");
            },
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as typeof db.prisma;
    const res = await request(createApp()).get("/api/emails");
    assert.equal(res.status, 500);
  });

  it("GET /api/tests/:id 500 when prisma fails", async () => {
    db.prisma = new Proxy(createStubPrisma(), {
      get(target, prop, receiver) {
        if (prop === "test") {
          return {
            findUnique: async () => {
              throw new Error("db");
            },
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as typeof db.prisma;
    const res = await request(createApp()).get("/api/tests/any-id");
    assert.equal(res.status, 500);
  });

  it("GET /api/lots/:id 500 during backfill/query", async () => {
    db.prisma = new Proxy(createStubPrisma(), {
      get(target, prop, receiver) {
        if (prop === "test") {
          return {
            findMany: async () => {
              throw new Error("db");
            },
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as typeof db.prisma;
    const res = await request(createApp()).get("/api/lots/lid");
    assert.equal(res.status, 500);
  });

  it("GET /api/ailogs 500 when prisma fails", async () => {
    db.prisma = new Proxy(createStubPrisma(), {
      get(target, prop, receiver) {
        if (prop === "aILog") {
          return {
            findMany: async () => {
              throw new Error("db");
            },
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as typeof db.prisma;
    const res = await request(createApp()).get("/api/ailogs");
    assert.equal(res.status, 500);
  });

  it("POST /api/reviews/:id/approve 500 when prisma fails", async () => {
    db.prisma = new Proxy(createStubPrisma(), {
      get(target, prop, receiver) {
        if (prop === "labReport") {
          return {
            update: async () => {
              throw new Error("db");
            },
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as typeof db.prisma;
    const res = await request(createApp()).post("/api/reviews/r1/approve").send({});
    assert.equal(res.status, 500);
  });

  it("GET /api/reviews/:id 500 when prisma fails", async () => {
    db.prisma = new Proxy(createStubPrisma(), {
      get(target, prop, receiver) {
        if (prop === "labReport") {
          return {
            findUnique: async () => {
              throw new Error("db");
            },
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as typeof db.prisma;
    const res = await request(createApp()).get("/api/reviews/r99");
    assert.equal(res.status, 500);
  });

  it("POST /api/webhooks/zapier 500 when email create fails", async () => {
    const inner = createWebhookPrisma("tid-500");
    db.prisma = new Proxy(inner, {
      get(target, prop, receiver) {
        if (prop === "email") {
          return {
            create: async () => {
              throw new Error("db");
            },
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as typeof db.prisma;
    const res = await request(createApp()).post("/api/webhooks/zapier").send({
      test_id: "tid-500",
    });
    assert.equal(res.status, 500);
  });

  it("PUT /api/settings/system/key 500 when upsert fails", async () => {
    db.prisma = new Proxy(createStubPrisma(), {
      get(target, prop, receiver) {
        if (prop === "systemSetting") {
          return {
            upsert: async () => {
              throw new Error("db");
            },
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as typeof db.prisma;
    const res = await request(createApp()).put("/api/settings/system/k").send({ value: "v" });
    assert.equal(res.status, 500);
  });
});
