import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: ".next-webpack",
  transpilePackages: ["@dealdash/backend"],
  outputFileTracingRoot: path.resolve(process.cwd(), ".."),
};

export default nextConfig;
