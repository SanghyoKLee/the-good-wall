/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    serverComponentsExternalPackages: ["@sparticuz/chromium"],
    outputFileTracingIncludes: {
      "app/api/instagram/scrape/route.ts": [
        "./node_modules/@sparticuz/chromium/**",
      ],
    },
  },
};
