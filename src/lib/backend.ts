const DEFAULT_DEVELOPMENT_BACKEND = "http://127.0.0.1:8000";
const DEFAULT_PRODUCTION_BACKEND = "https://bengarlock.com";

export function getBackendBaseUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.trim();
  const fallback =
    process.env.NODE_ENV === "production"
      ? DEFAULT_PRODUCTION_BACKEND
      : DEFAULT_DEVELOPMENT_BACKEND;

  return (configuredUrl || fallback).replace(/\/$/, "");
}

export function getTableHostApiUrl(path = ""): string {
  const normalizedPath = path.replace(/^\//, "");
  return `${getBackendBaseUrl()}/api/v1/tablehost/${normalizedPath}`;
}
