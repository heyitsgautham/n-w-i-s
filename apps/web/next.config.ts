import type { NextConfig } from "next";

/**
 * Sent with every page and route. The console is never framed, sniffed or asked for a camera.
 * There is no Content-Security-Policy yet: Google's Maps bootstrap loads scripts and workers from several
 * Google hosts, and a policy that allows them needs testing against a real key.
 */
export const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  transpilePackages: ["@wells/correlate", "@wells/synth"],
  devIndicators: false,
  agentRules: false,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
