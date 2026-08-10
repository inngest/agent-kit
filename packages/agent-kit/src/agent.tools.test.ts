import { afterEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";
import { createAgent } from "./agent";
import { openai } from "./models";
import { createTool } from "./tool";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Agent tool invocation", () => {
  test("validates model input before executing a tool handler", async () => {
    const handler = vi.fn(() => ({ ok: true }));
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: "call_write",
                    type: "function",
                    function: {
                      name: "write",
                      arguments: '{"files":"not-an-array"}',
                    },
                  },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
        })
      )
    );

    const agent = createAgent({
      name: "test-agent",
      system: "Use the write tool.",
      model: openai({ model: "gpt-4o", apiKey: "test-key" }),
      tools: [
        createTool({
          name: "write",
          parameters: z.object({
            files: z.array(z.object({ path: z.string(), content: z.string() })),
          }),
          handler,
        }),
      ],
    });

    const result = await agent.run("Write a file");

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(handler).not.toHaveBeenCalled();
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]?.content).toHaveProperty("error");
  });
});
