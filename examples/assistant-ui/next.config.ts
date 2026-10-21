import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This example has its own package-lock.json; without this, Turbopack picks
  // the agent-kit monorepo root as the workspace root.
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
