/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";
const isCapacitor = process.env.CAP_BUILD === "1"; // native iOS/Android build (assets served from app root)
const repo = "RipoPlan"; // GitHub Pages serves the web app under /<repo>/

const nextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  basePath: isProd && !isCapacitor ? `/${repo}` : "",
  assetPrefix: isProd && !isCapacitor ? `/${repo}/` : "",
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  env: {
    NEXT_PUBLIC_BASE_PATH: isProd && !isCapacitor ? `/${repo}` : "",
  },
};

export default nextConfig;
