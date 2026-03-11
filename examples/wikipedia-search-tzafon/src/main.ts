import { createServer } from "@inngest/agent-kit/server";

import {
  createAgent,
  createNetwork,
  createTool,
  openai,
} from "@inngest/agent-kit";
import { chromium } from "playwright-core";
import Computer from "tzafon";
import { z } from "zod";

import dotenv from "dotenv";
dotenv.config();

const TZAFON_API_KEY = process.env.TZAFON_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const BASE_URL = "https://api.tzafon.ai";

const client = new Computer({
  apiKey: TZAFON_API_KEY,
});

const model = openai({
  model: "gpt-4o-mini",
  apiKey: OPENAI_API_KEY,
});

// Create a tool to search Wikipedia using Tzafon
export const searchWikipedia = createTool({
  name: "search_wikipedia",
  description: "Search Wikipedia for relevant information",
  parameters: z.object({
    query: z.string().describe("The search query for Wikipedia"),
  }),
  handler: async ({ query }, { step }) => {
    return await step?.run("search-on-wikipedia", async () => {
      // Create a new session
      const session = await client.create({ kind: "browser" });
      const cdpUrl = `${BASE_URL}/computers/${session.id}/cdp?token=${TZAFON_API_KEY}`;
      // Connect to the session
      const browser = await chromium.connectOverCDP(cdpUrl);
      try {
        const context = await browser.newContext();
        const page = await context.newPage();

        await page.goto("https://en.wikipedia.org/wiki/Special:Search");
        const searchBox = await page.$("#ooui-php-1");
        await searchBox?.click();
        await searchBox?.fill(query);
        await page
          .getByLabel("Search", { exact: true })
          .getByRole("button", { name: "Search", exact: true })
          .click();
        await page.waitForLoadState("networkidle");
        const firstResultLink = await page
          .locator("div.mw-search-results-container")
          .locator("ul.mw-search-results")
          .locator("li")
          .first()
          .locator("div.mw-search-result-heading")
          .locator("a");
        await firstResultLink.click();
        await page.waitForLoadState("networkidle");
        const pageContent = await page.innerHTML("body");
        return pageContent;
      } finally {
        await browser.close();
      }
    });
  },
});

export const searchAgent = createAgent({
  name: "wikipedia_searcher",
  description: "An agent that searches Wikipedia for relevant information",
  system:
    "You are a helpful assistant that searches Wikipedia for relevant information.",
  tools: [searchWikipedia],
});

// Create the network
export const wikipediaSearchNetwork = createNetwork({
  name: "wikipedia_search_network",
  description: "A network that searches Wikipedia using Tzafon",
  agents: [searchAgent],
  maxIter: 2,
  defaultModel: model,
});

async function main() {
  const server = createServer({
    agents: [searchAgent],
    networks: [wikipediaSearchNetwork],
  });
  server.listen(3000, () => console.log("AgentKit server running!"));
}

main();
