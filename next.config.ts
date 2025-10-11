import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

module.exports = {
  experimental: {
    serverComponentsExternalPackages: ["@sparticuz/chromium"],
  },
};

export default nextConfig;
