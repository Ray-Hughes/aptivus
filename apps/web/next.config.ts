import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Lets a Server Component call forbidden() and render a real 403 instead of
    // bouncing a signed-in non-admin around the sign-in page forever.
    authInterrupts: true,
  },
};

export default nextConfig;
