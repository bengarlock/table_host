const mode = process.argv[2];

if (!new Set(["development", "production"]).has(mode)) {
  console.error("Usage: node scripts/validate-backend-target.mjs <development|production>");
  process.exit(1);
}

const configuredUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.trim();
const fallback = mode === "production" ? "https://bengarlock.com" : "http://127.0.0.1:8000";
const backendUrl = configuredUrl || fallback;
const isLocal = /(^|\/)localhost(?::|\/|$)|127\.0\.0\.1/.test(backendUrl);

if (mode === "production" && isLocal) {
  console.error("Production backend target cannot point to localhost.");
  process.exit(1);
}

if (mode === "development" && !configuredUrl && !isLocal) {
  console.error("Development fallback must point to a local backend.");
  process.exit(1);
}

console.log(`${mode} backend target verified: ${backendUrl}`);
