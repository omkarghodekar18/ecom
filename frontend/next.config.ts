import type { NextConfig } from 'next';
import path from 'node:path';

const backend = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    loader: 'custom',
    loaderFile: './src/lib/image-loader.ts',
    imageSizes: [48, 64, 96, 128, 256, 384, 640, 1024, 1536],
  },
  turbopack: {
    resolveAlias: {
      '../enums.js': path.resolve(__dirname, 'src/shared/enums'),
      './auth.dto.js': path.resolve(__dirname, 'src/shared/dto/auth.dto'),
    },
  },
  async rewrites() {
    return [
      { source: '/api/v1/:path*', destination: `${backend}/api/v1/:path*` },
      { source: '/media/:path*', destination: `${backend}/media/:path*` },
    ];
  },
};

export default nextConfig;
