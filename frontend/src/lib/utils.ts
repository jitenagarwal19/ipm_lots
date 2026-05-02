import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

function useBackendProxy(): boolean {
  return process.env.NEXT_PUBLIC_USE_BACKEND_PROXY === "true";
}

/**
 * Base URL for the Express API (no trailing slash). When `NEXT_PUBLIC_USE_BACKEND_PROXY` is true,
 * the browser talks to same-origin `/api/backend/*` (see `app/api/backend/[...path]/route.ts`).
 */
export function getBackendBaseUrl() {
  if (typeof window !== "undefined" && useBackendProxy()) {
    return "";
  }

  // Prefer explicit env to support non-default ports/hosts.
  const envUrl =
    (typeof window === "undefined"
      ? process.env.BACKEND_URL
      : process.env.NEXT_PUBLIC_BACKEND_URL) || "";

  if (envUrl) return envUrl.replace(/\/+$/, "");

  if (typeof window === "undefined") return "http://localhost:4000";

  return `http://${window.location.hostname}:4000`;
}

export function getApiBaseUrl() {
  if (typeof window !== "undefined" && useBackendProxy()) {
    return "/api/backend";
  }
  return `${getBackendBaseUrl()}/api`;
}

/** Absolute base for `/uploads` and other static files served by the API. */
export function getUploadBaseUrl() {
  if (typeof window !== "undefined" && useBackendProxy()) {
    return window.location.origin;
  }

  const envUrl =
    (typeof window === "undefined"
      ? process.env.BACKEND_URL
      : process.env.NEXT_PUBLIC_BACKEND_URL) || "";

  if (envUrl) return envUrl.replace(/\/+$/, "");

  if (typeof window === "undefined") return "http://localhost:4000";

  return `http://${window.location.hostname}:4000`;
}
