import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "4000",
        pathname: "/uploads/**",
      },
    ],
  },
  async rewrites() {
    return [
      {
        // Proxy uploads to backend
        source: "/uploads/:path*",
        destination: `${process.env.BACKEND_URL || "http://localhost:4000"}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
