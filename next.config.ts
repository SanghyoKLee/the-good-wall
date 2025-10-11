/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // make sure Next knows it can bundle this native package
    serverComponentsExternalPackages: ["@sparticuz/chromium"],
    // explicitly include the chromium bin files for your API route
    outputFileTracingIncludes: {
      "app/api/instagram/scrape/route.ts": [
        "./node_modules/@sparticuz/chromium/bin/**",
      ],
    },
  },
};

module.exports = nextConfig;
