import type { PrismaClient } from "@prisma/client";

function modelDelegate() {
  return {
    findMany: async () => [],
    findUnique: async () => null,
    findFirst: async () => null,
    create: async (args: { data?: Record<string, unknown> }) => ({
      id: "mock-id",
      ...(args?.data || {}),
    }),
    createMany: async () => ({ count: 0 }),
    update: async () => ({ id: "mock-id" }),
    updateMany: async () => ({ count: 0 }),
    deleteMany: async () => ({ count: 0 }),
    upsert: async (opts: { create?: Record<string, unknown>; update?: Record<string, unknown> }) =>
      opts?.create ?? opts?.update ?? { id: "mock-upsert" },
  };
}

/** Default stub for API integration tests (empty lists / null lookups). */
export function createStubPrisma(): PrismaClient {
  const delegate = modelDelegate();
  const root = new Proxy({} as PrismaClient, {
    get(_, prop: string | symbol) {
      if (typeof prop !== "string") return undefined;
      if (prop === "$queryRaw") {
        return (_strings: TemplateStringsArray, ..._values: unknown[]) => Promise.resolve([{ ok: 1 }]);
      }
      if (prop === "$disconnect") {
        return async () => undefined;
      }
      return new Proxy(delegate, {
        get(__, method: string | symbol) {
          if (typeof method !== "string") return undefined;
          const fn = (delegate as Record<string, (...args: unknown[]) => Promise<unknown>>)[method];
          return fn ?? (async () => null);
        },
      });
    },
  });
  return root;
}

const baseReport = (id: string) => ({
  id,
  metadata_json: '{"m":1}',
  results_json: '{"summary":"s"}',
  raw_ai_json: "null",
  status: "PENDING_REVIEW",
  test_id: "t1",
  test: { id: "t1", lot: { lot_number: "L1" }, lab: { name: "Lab" }, test_type: { name: "T" } },
  email: null,
  attachment: null,
  moleculeResults: [],
});

/** Lab reports list/detail + approve flows */
export function prismaReviewsFlow(reportId = "rep-1"): PrismaClient {
  const report = baseReport(reportId);
  return new Proxy(createStubPrisma(), {
    get(target, prop, receiver) {
      if (prop === "labReport") {
        return {
          findMany: async () => [report],
          findUnique: async () => report,
          update: async () => ({
            ...report,
            status: "APPROVED",
            test_id: "t1",
            test: { id: "t1" },
          }),
        };
      }
      if (prop === "test") {
        return {
          ...Reflect.get(target, prop, receiver),
          update: async () => ({ id: "t1", status: "COMPLETED" }),
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as PrismaClient;
}

/** Single test with relations for GET /api/tests/:id */
export function prismaTestDetail(testId = "tid-1"): PrismaClient {
  const test = {
    id: testId,
    lot: { id: "l1", lot_number: "LOT-1", product: {}, variant: null, company: {} },
    lab: { name: "Lab" },
    test_type: { name: "Type" },
    emails: [],
    labReports: [],
  };
  return new Proxy(createStubPrisma(), {
    get(target, prop, receiver) {
      if (prop === "test") {
        return {
          findMany: async () => [test],
          findUnique: async () => test,
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as PrismaClient;
}

/** Tracked labels setting present but only empty / comma tokens */
export function prismaTrackedLabelsBlank(): PrismaClient {
  return new Proxy(createStubPrisma(), {
    get(target, prop, receiver) {
      if (prop === "systemSetting") {
        return {
          findUnique: async () => ({
            key: "tracked_email_labels",
            value: "  ,  ,  ",
          }),
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as PrismaClient;
}

/** Lot detail with empty tests (skips AI backfill loop body) */
export function prismaLotDetail(lotId = "lot-1"): PrismaClient {
  const lot = {
    id: lotId,
    lot_number: "LOT-X",
    product: { name: "P" },
    variant: null,
    company: { name: "C" },
    tests: [],
  };
  return new Proxy(createStubPrisma(), {
    get(target, prop, receiver) {
      if (prop === "lot") {
        return {
          findUnique: async () => lot,
        };
      }
      if (prop === "test") {
        return {
          ...Reflect.get(target, prop, receiver),
          findMany: async () => [],
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as PrismaClient;
}

/** Zapier webhook happy path */
export function createWebhookPrisma(testId = "test-webhook-1"): PrismaClient {
  const stub = createStubPrisma();
  const targetTest = { id: testId, email_thread_id: "thread-hook" };
  return new Proxy(stub, {
    get(target, prop, receiver) {
      if (prop === "test") {
        return {
          ...Reflect.get(target, prop, receiver),
          findUnique: async () => targetTest,
          update: async () => ({ ...targetTest, status: "REPORT_RECEIVED" }),
        };
      }
      if (prop === "email") {
        return {
          ...Reflect.get(target, prop, receiver),
          create: async () => ({ id: "email-new", test_id: testId }),
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as PrismaClient;
}
