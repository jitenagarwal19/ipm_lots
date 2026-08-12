import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Base URL for API calls.
 *
 * In the browser this is deliberately empty, so every request goes to /api on
 * the page's own origin and is proxied to Express — by Next rewrites in
 * development, by Nginx in production. Same-origin is what lets the session
 * cookie travel as SameSite=Lax; pointing the browser at a second origin breaks
 * login and brings back CORS.
 *
 * NEXT_PUBLIC_BACKEND_URL still overrides it for the occasional split
 * deployment, but that setup needs SameSite=None and HTTPS to log in.
 */
export function getBackendBaseUrl() {
  if (typeof window === "undefined") {
    return (process.env.BACKEND_URL || "http://127.0.0.1:4000").replace(/\/+$/, "");
  }
  return (process.env.NEXT_PUBLIC_BACKEND_URL || "").replace(/\/+$/, "");
}

export function getApiBaseUrl() {
  return `${getBackendBaseUrl()}/api`;
}
