/* eslint-disable */
import "dotenv/config";
import {
  anthropic,
  createAgent,
  createNetwork,
  createTool,
} from "@inngest/agent-kit";
import { createServer } from "@inngest/agent-kit/server";
import { z } from "zod";
import { chromium } from "playwright-core";
import Browserbase from "@browserbasehq/sdk";

const bb = new Browserbase({
  apiKey: process.env.BROWSERBASE_API_KEY as string,
});

// Create a tool to search Reddit using Browserbase
const searchReddit = createTool({
  name: "search_reddit",
  description: "Search Reddit posts and comments",
  parameters: z.object({
    query: z.string().describe("The search query for Reddit"),
  }),
  handler: async ({ query }, { step }) => {
    return await step?.run("search-on-reddit", async () => {
      // Create a new session
      const session = await bb.sessions.create({
        projectId: process.env.BROWSERBASE_PROJECT_ID as string,
      });

      // Connect to the session
      const browser = await chromium.connectOverCDP(session.connectUrl);
      try {
        const page = await browser.newPage();

        // Construct the search URL
        const searchUrl = `https://search-new.pullpush.io/?type=submission&q=${query}`;

        await page.goto(searchUrl);

        // Wait for results to load
        await page.waitForSelector("div.results", { timeout: 10000 });

        // Extract search results
        const results = await page.evaluate(() => {
          const posts = document.querySelectorAll("div.results div:has(h1)");
          return Array.from(posts).map((post) => ({
            title: post.querySelector("h1")?.textContent?.trim(),
            content: post.querySelector("div")?.textContent?.trim(),
          }));
        });

        return results.slice(0, 5); // Return top 5 results
      } finally {
        await browser.close();
      }
    });
  },
});

// Create the search agent
const searchAgent = createAgent({
  name: "reddit_searcher",
  description: "An agent that searches Reddit for relevant information",
  system:
    "You are a helpful assistant that searches Reddit for relevant information.",
  tools: [searchReddit],
});

// Create the network
const redditSearchNetwork = createNetwork({
  name: "reddit-search-network",
  description: "A network that searches Reddit using Browserbase",
  agents: [searchAgent],
  maxIter: 2,
  defaultModel: anthropic({
    model: "claude-3-5-sonnet-latest",
    max_tokens: 4096,
  }),
});

// Create and start the server
const server = createServer({
  networks: [redditSearchNetwork],
});

server.listen(3010, () =>
  console.log("Reddit Search Agent server is running on port 3010")
);
