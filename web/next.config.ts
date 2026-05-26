import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Barrel-file optimization: only bundle the icons actually imported
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
