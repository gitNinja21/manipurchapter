import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    // face-api.js (via @tensorflow/tfjs-core) has an optional Node.js code
    // path (fs, node-fetch's "encoding") that's only ever used when running
    // under Node, never in the browser. We only ever import face-api.js
    // from client components, so these modules are safe to stub out — this
    // just silences webpack's "module not found" warnings for a path that's
    // never actually executed client-side.
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      encoding: false,
    };
    return config;
  },
};

export default nextConfig;
