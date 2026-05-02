import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getBackendBaseUrl() {
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
  return `${getBackendBaseUrl()}/api`;
}
