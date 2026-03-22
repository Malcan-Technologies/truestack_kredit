import type { NextConfig } from "next";

const s3Bucket = process.env.S3_BUCKET || "truekredit-uploads-prod";
const awsRegion = process.env.AWS_REGION || "ap-southeast-5";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "4001",
        pathname: "/uploads/**",
      },
      {
        protocol: "https",
        hostname: `${s3Bucket}.s3.${awsRegion}.amazonaws.com`,
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: `${s3Bucket}.s3.amazonaws.com`,
        pathname: "/**",
      },
    ],
  },
  async rewrites() {
    return [
      {
        // Proxy uploads to backend
        source: "/uploads/:path*",
        destination: `${process.env.BACKEND_URL || "http://localhost:4001"}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
