const APP_BASE_PATH = process.env.NODE_ENV === "production" ? "/tablehost" : "";

export function appPath(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${APP_BASE_PATH}${normalizedPath}`;
}
