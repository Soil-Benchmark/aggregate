import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Route handlers read these files from disk at request time (locate.ts reads
  // the district/catchment geojson; the OG image reads the logo). Make sure the
  // standalone trace includes them so they're available at runtime.
  outputFileTracingIncludes: {
    "/api/data": ["./public/data/**"],
    "/api/farms": ["./public/data/**"],
    "/opengraph-image": ["./public/bubbles-orange.svg"],
    "/twitter-image": ["./public/bubbles-orange.svg"],
  },
};

export default nextConfig;
