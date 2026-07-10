import { createServer } from "@inngest/agent-kit/server";

import {
  createAgent,
  createNetwork,
  createTool,
  openai,
} from "@inngest/agent-kit";
import { chromium } from "playwright-core";
import Lightcone from "@tzafon/lightcone";
import { z } from "zod";

import dotenv from "dotenv";
dotenv.config();

const LIGHTCONE_API_KEY = process.env.LIGHTCONE_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const BASE_URL = "https://api.tzafon.ai";

const client = new Lightcone({
  apiKey: LIGHTCONE_API_KEY,
});

const model = openai({
  model: "gpt-4o-mini",
  apiKey: OPENAI_API_KEY,
});

// Create a tool that searches Wikipedia inside a managed Lightcone browser.
export const searchWikipedia = createTool({
  name: "search_wikipedia",
  description: "Search Wikipedia for relevant information",
  parameters: z.object({
    query: z.string().describe("The search query for Wikipedia"),
  }),
  handler: async ({ query }, { step }) => {
    return await step?.run("search-on-wikipedia", async () => {
      // Spin up a cloud browser.
      const session = await client.computers.create({ kind: "browser" });

      // Build the CDP URL from the session's endpoint path and connect,
      // authenticating with a Bearer token.
      const cdpUrl = `${BASE_URL}${session.endpoints?.cdp}`;
      const browser = await chromium.connectOverCDP(cdpUrl, {
        headers: {
          Authorization: `Bearer ${LIGHTCONE_API_KEY}`,
        },
      });

      try {
        const page = browser.contexts()[0].pages()[0];

        // Navigating to the search endpoint redirects to the matching article
        // (or a results page), which avoids brittle search-box selectors.
        await page.goto(
          `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(query)}`,
          { waitUntil: "domcontentloaded" },
        );

        // If we landed on a results page, open the first result.
        const firstResult = page
          .locator("ul.mw-search-results li div.mw-search-result-heading a")
          .first();
        if (await firstResult.count()) {
          await firstResult.click();
          await page.waitForLoadState("domcontentloaded");
        }

        const title = await page.title();
        const content = await page.innerText("#mw-content-text");
        return `${title}\n\n${content.slice(0, 4000)}`;
      } finally {
        await browser.close();
        await client.computers.delete(session.id!);
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
  description: "A network that searches Wikipedia using Lightcone",
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
