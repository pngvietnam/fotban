import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["pino"],
  experimental: {
    // The dev MCP endpoint writes every request and forwarded browser log to .next/dev/logs; on this
    // Windows setup each write was picked up as a change and refreshed every open tab in a loop.
    mcpServer: false,
  },
};

export default config;
