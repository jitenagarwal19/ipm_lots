import path from 'node:path';

/**
 * Where lab-report attachments live.
 *
 * Defaults to `<cwd>/uploads`, which is what local development has always used.
 * In production set UPLOADS_DIR to a path outside the checkout — otherwise a
 * deploy that replaces or relocates the working directory takes 159 lab-report
 * PDFs with it, and those are the evidence behind compliance decisions.
 *
 * This used to be computed independently in index.ts and services/email.ts.
 * Two copies of a storage path is one copy too many.
 */
export const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(process.cwd(), 'uploads');
