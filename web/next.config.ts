import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  experimental: {
    // Barrel-file optimization: only bundle the icons actually imported
    optimizePackageImports: ["lucide-react"],
  },
  // Cloudflare's free plan has no image optimization; the logos are small SVG/PNGs anyway
  images: { unoptimized: true },
};

export default nextConfig;

initOpenNextCloudflareForDev();
