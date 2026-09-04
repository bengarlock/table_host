import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  typescript: {
    tsconfigPath: process.env.NEXT_TSCONFIG_PATH || "tsconfig.json",
  },
  turbopack: {
    root: path.join(__dirname),
  },
  basePath: process.env.NODE_ENV === "production" ? "/tablehost" : "",
  reactStrictMode: true,
};

export default nextConfig;
