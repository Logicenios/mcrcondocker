import { DiagnosticError } from "./diagnostic-messages.js";
export type BlueMapAccess = "all" | "operator";
export interface BlueMapSettings { url: string | null; access: BlueMapAccess }

/** Same-origin maps may use the dashboard session, so never grant viewers access implicitly. */
export function blueMapAccess(url: string | null, dashboardOrigin: string, configured: string | null): BlueMapAccess {
  return configured === "operator" || (!!url && new URL(url).origin === dashboardOrigin) ? "operator" : "all";
}

/** Browser-side embedding only: the backend never fetches a user-provided URL. */
export function normalizeBlueMapUrl(input: unknown): string | null {
  if (input === null || input === "") return null;
  if (typeof input !== "string" || input.length > 2048 || /[\u0000-\u0020\u007f]/.test(input.trim())) {
    throw new DiagnosticError("blueMapInvalidUrl");
  }
  let url: URL;
  try { url = new URL(input.trim()); } catch {
    throw new DiagnosticError("blueMapInvalidUrl");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || !url.hostname) {
    throw new DiagnosticError("blueMapInvalidUrl");
  }
  return url.href;
}
