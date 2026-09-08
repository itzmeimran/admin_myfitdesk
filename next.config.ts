import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Otherwise Turbopack walks up looking for a workspace root and stops at
  // C:\Users\user because a stray package-lock.json lives there — pinning it
  // here removes that warning on every `next dev`. Same fix as FitDeskApp's
  // next.config.ts; this repo has no avatar-upload / bodySizeLimit need, so
  // that part of the tenant app's config is dropped.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
