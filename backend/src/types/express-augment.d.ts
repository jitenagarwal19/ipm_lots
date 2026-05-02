import "express-serve-static-core";

declare module "express-serve-static-core" {
  interface Request {
    /** Correlates logs from browser → Express → Gmail/OpenAI → DB (see X-Request-Id). */
    requestId: string;
  }
}

export {};
