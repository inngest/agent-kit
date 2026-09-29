import { describe, expect, test } from "vitest";
import { z } from "zod";
import { requestParser } from "./adapters/openai";
import { createTool } from "./tool";

const parameters = z.object({
  query: z.string(),
  limit: z.number().optional(),
});

describe("createTool", () => {
  test("keeps the strict option on the returned tool", () => {
    const tool = createTool({
      name: "search",
      parameters,
      strict: false,
      handler: () => "ok",
    });

    expect(tool.strict).toBe(false);
  });

  test("leaves strict undefined when it isn't set", () => {
    const tool = createTool({
      name: "search",
      parameters,
      handler: () => "ok",
    });

    expect(tool.strict).toBeUndefined();
  });

  test("lets strict: false reach the OpenAI request", () => {
    const tool = createTool({
      name: "search",
      parameters,
      strict: false,
      handler: () => "ok",
    });

    const request = requestParser(
      { options: { model: "gpt-4o" } } as never,
      [{ type: "text", role: "user", content: "hi" }],
      [tool],
      "auto",
    );

    expect(request.tools?.[0]?.function?.strict).toBe(false);
  });
});
