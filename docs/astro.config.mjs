import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightLlmsTxt from "starlight-llms-txt";
import starlightCopyButton from "starlight-copy-button";

export default defineConfig({
  site: "https://agentkit.inngest.com",
  trailingSlash: "never",
  integrations: [
    starlight({
      title: "AgentKit by Inngest",
      plugins: [
        starlightLlmsTxt(),
        starlightCopyButton({
          label: "Copy as markdown",
        }),
      ],
      logo: {
        light: "./public/brand/logo-light.svg",
        dark: "./public/brand/logo-dark.svg",
        replacesTitle: true,
      },
      favicon: "/brand/favicon.png",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/inngest/agent-kit",
        },
        {
          icon: "discord",
          label: "Community",
          href: "https://www.inngest.com/discord",
        },
        {
          icon: "x.com",
          label: "X",
          href: "https://x.com/inngest",
        },
      ],
      customCss: ["./src/styles/custom.css"],
      head: [
        {
          tag: "script",
          attrs: {
            async: true,
            src: "https://www.googletagmanager.com/gtag/js?id=G-PPJW3MPTNX",
          },
        },
        {
          tag: "script",
          content:
            "window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-PPJW3MPTNX');",
        },
      ],
      components: {
        SocialIcons: "./src/components/SocialIcons.astro",
      },
      sidebar: [
        {
          label: "Get Started",
          items: [
            { label: "Overview", slug: "" },
            { label: "Quick Start", slug: "getting-started/quick-start" },
            { label: "Installation", slug: "getting-started/installation" },
            {
              label: "Local Development",
              slug: "getting-started/local-development",
            },
          ],
        },
        {
          label: "Concepts",
          items: [
            { label: "Agents", slug: "concepts/agents" },
            { label: "Tools", slug: "concepts/tools" },
            { label: "Networks", slug: "concepts/networks" },
            { label: "State", slug: "concepts/state" },
            { label: "Routers", slug: "concepts/routers" },
            { label: "History", slug: "concepts/history" },
            { label: "Memory", slug: "concepts/memory" },
            { label: "Models", slug: "concepts/models" },
            { label: "Deployment", slug: "concepts/deployment" },
          ],
        },
        {
          label: "Streaming",
          items: [
            { label: "Overview", slug: "streaming/overview" },
            { label: "Usage Guide", slug: "streaming/usage-guide" },
            { label: "Events", slug: "streaming/events" },
            { label: "Transport", slug: "streaming/transport" },
            { label: "Provider", slug: "streaming/provider" },
          ],
        },
        {
          label: "Advanced Patterns",
          items: [
            { label: "Routing", slug: "advanced-patterns/routing" },
            { label: "MCP", slug: "advanced-patterns/mcp" },
            {
              label: "Human in the Loop",
              slug: "advanced-patterns/human-in-the-loop",
            },
            {
              label: "Multi-step Tools",
              slug: "advanced-patterns/multi-steps-tools",
            },
            { label: "Retries", slug: "advanced-patterns/retries" },
            {
              label: "Multitenancy",
              slug: "advanced-patterns/multitenancy",
            },
            {
              label: "Legacy UI Streaming",
              slug: "advanced-patterns/legacy-ui-streaming",
            },
          ],
        },
        {
          label: "Guided Tour",
          items: [
            { label: "Overview", slug: "guided-tour/overview" },
            { label: "AI Workflows", slug: "guided-tour/ai-workflows" },
            {
              label: "Agentic Workflows",
              slug: "guided-tour/agentic-workflows",
            },
            { label: "AI Agents", slug: "guided-tour/ai-agents" },
          ],
        },
        {
          label: "Integrations",
          items: [
            { label: "E2B", slug: "integrations/e2b" },
            { label: "Browserbase", slug: "integrations/browserbase" },
            { label: "Smithery", slug: "integrations/smithery" },
            { label: "Daytona", slug: "integrations/daytona" },
          ],
        },
        {
          label: "Examples",
          items: [{ label: "Examples", slug: "examples/overview" }],
        },
        {
          label: "Reference",
          items: [
            { label: "Introduction", slug: "reference/introduction" },
            { label: "createAgent", slug: "reference/create-agent" },
            { label: "createTool", slug: "reference/create-tool" },
            { label: "createNetwork", slug: "reference/create-network" },
            { label: "State", slug: "reference/state" },
            { label: "Network Router", slug: "reference/network-router" },
            { label: "useAgent", slug: "reference/use-agent" },
            { label: "OpenAI", slug: "reference/model-openai" },
            { label: "Anthropic", slug: "reference/model-anthropic" },
            { label: "Gemini", slug: "reference/model-gemini" },
            { label: "Grok", slug: "reference/model-grok" },
          ],
        },
        {
          label: "React Hooks",
          items: [
            {
              label: "Overview",
              slug: "reference/react-hooks/overview",
            },
            {
              label: "AgentProvider",
              slug: "reference/react-hooks/agent-provider",
            },
            {
              label: "useAgent",
              slug: "reference/react-hooks/use-agent",
            },
            {
              label: "useChat",
              slug: "reference/react-hooks/use-chat",
            },
          ],
        },
        {
          label: "Changelog",
          items: [{ label: "Changelog", slug: "changelog/overview" }],
        },
      ],
    }),
  ],
  redirects: {
    "/overview": "/",
    "/reference/create-typed-tool": "/reference/create-tool",
    "/ai-agents-in-practice/overview": "/guided-tour/overview",
    "/ai-agents-in-practice/ai-agents": "/guided-tour/ai-agents",
    "/ai-agents-in-practice/ai-workflows": "/guided-tour/ai-workflows",
    "/ai-agents-in-practice/agentic-workflows":
      "/guided-tour/agentic-workflows",
  },
});
