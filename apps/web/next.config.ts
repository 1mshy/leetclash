import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Transpile the workspace types package (plain TS source).
  transpilePackages: ["@leetclash/shared"],
};

export default nextConfig;
