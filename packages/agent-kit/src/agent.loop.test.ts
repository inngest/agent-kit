import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createAgent, createState, createTool, openai } from "./index";

type ChatBody = {
  messages: Array<{
    role: string;
    content: string | null;
    tool_call_id?: string;
    tool_calls?: Array<{ id: string }>;
  }>;
};

describe("Agent.run with maxIter", () => {
  const bodies: ChatBody[] = [];

  beforeEach(() => {
    bodies.length = 0;
    vi.spyOn(global, "fetch").mockImplementation((_url, options) => {
      bodies.push(JSON.parse(options?.body as string) as ChatBody);

      const message =
        bodies.length === 1
          ? {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: {
                    name: "add",
                    arguments: JSON.stringify({ a: 5, b: 3 }),
                  },
                },
              ],
            }
          : { role: "assistant", content: "The answer is 8" };

      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message,
                finish_reason: bodies.length === 1 ? "tool_calls" : "stop",
              },
            ],
          }),
      } as Response);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends the tool result and prior history in the follow-up inference", async () => {
    const agent = createAgent({
      name: "calculator",
      system: "You are a calculator.",
      model: openai({ model: "gpt-4o", apiKey: "test-key" }),
      tools: [
        createTool({
          name: "add",
          parameters: z.object({ a: z.number(), b: z.number() }),
          handler: ({ a, b }) => ({ result: a + b }),
        }),
      ],
    });

    const state = createState(
      {},
      {
        messages: [
          { type: "text", role: "user", content: "earlier question" },
          { type: "text", role: "assistant", content: "earlier answer" },
        ],
      }
    );

    const result = await agent.run("What is 5 + 3?", { maxIter: 2, state });

    expect(bodies).toHaveLength(2);

    const followUp = bodies[1]!.messages;
    const contents = followUp.map((m) => m.content);
    expect(contents).toContain("earlier question");
    expect(contents).toContain("earlier answer");

    const callIndex = followUp.findIndex((m) => m.tool_calls?.length);
    expect(callIndex).toBeGreaterThan(-1);
    expect(followUp[callIndex + 1]).toMatchObject({
      role: "tool",
      tool_call_id: "call_1",
      content: JSON.stringify({ data: { result: 8 } }),
    });

    expect(result.output).toMatchObject([
      { type: "text", content: "The answer is 8" },
    ]);
  });
});
