/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Only include these modules in the server build
    if (!isServer) {
      // Create an array of server-only packages
      const serverOnlyPackages = [
        '@browserbasehq/stagehand',
        'playwright',
        'playwright-core',
        'fsevents',
        'electron',
        'chromium-bidi',
      ];
      
      // Create a regex pattern for all server packages
      const serverPackagesRegex = new RegExp(`node_modules[/\\\\](${serverOnlyPackages.join('|')})([/\\\\]|$)`);
      
      // Add a rule to handle server-only modules
      config.module.rules.push({
        test: serverPackagesRegex,
        use: 'null-loader',
      });
      
      // Also explicitly exclude from client bundles via alias
      config.resolve.alias = {
        ...config.resolve.alias,
        ...serverOnlyPackages.reduce((acc, pkg) => {
          acc[pkg] = false;
          return acc;
        }, {})
      };
    }
    
    return config;
  },
  // Exclude problematic dependencies from being included in client bundles
  experimental: {
    serverComponentsExternalPackages: [
      '@browserbasehq/stagehand',
      'playwright',
      'playwright-core',
      'electron',
      'chromium-bidi',
    ],
  },
};

export default nextConfig;
