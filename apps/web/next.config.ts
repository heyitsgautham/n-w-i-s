import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@wells/correlate", "@wells/synth"],
  devIndicators: false,
  agentRules: false,
};

export default nextConfig;
