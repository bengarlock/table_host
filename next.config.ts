import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  basePath: process.env.NODE_ENV === "production" ? "/tablehost" : "",
  reactStrictMode: true,
};

export default nextConfig;
