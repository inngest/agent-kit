module.exports = {
     extends: [
       "eslint:recommended",
       "plugin:@typescript-eslint/recommended",
       "plugin:@typescript-eslint/recommended-requiring-type-checking",
       "prettier",
       "plugin:prettier/recommended",
     ],
     parser: "@typescript-eslint/parser",
     parserOptions: {
       tsconfigRootDir: __dirname,
       project: ["./tsconfig.json"],
     },
     plugins: ["@typescript-eslint", "import"],
     root: true,
     ignorePatterns: ["dist/", "*.d.ts", "*.js", "test/"],
     rules: {
       "prettier/prettier": "warn",
       "@typescript-eslint/no-unused-vars": [
         "warn",
         { varsIgnorePattern: "^_", argsIgnorePattern: "^_" },
       ],
       "@typescript-eslint/consistent-type-imports": [
         "error",
         { fixStyle: "inline-type-imports" },
       ],
       "@typescript-eslint/no-namespace": "off",
       "import/consistent-type-specifier-style": ["error", "prefer-inline"],
       "import/no-duplicates": ["error", { "prefer-inline": true }],
       "import/no-extraneous-dependencies": [
         "error",
         {
           devDependencies: [
             "**/*.test.ts",
             "**/test/**",
             "**/scripts/**",
           ],
           includeInternal: true,
           includeTypes: true,
         },
       ],
       "import/extensions": ["error", "ignorePackages"]
     },
     overrides: [
       {
         files: ["src/**/*.test.ts"],
         rules: {
           "import/extensions": "off",
         },
       },
     ],
   };
