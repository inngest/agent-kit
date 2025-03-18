import { describe, expect, test } from "vitest";
import { z } from "zod";
import { createState } from "./state";
import { createNetwork } from "./network";
import { createAgent } from "./agent";
import { type Tool, createTool } from "./tool";

interface Shape {
  category?: "refund" | "exchange";
  sku?: number;
}

describe("createState", () => {
  test("createState with types", () => {
    const s = createState<Shape>();
    s.data.category = "refund";
    s.data.sku = 123;
    expect(s.data.category).toBe("refund");
    expect(s.data.sku).toBe(123);
  });

  test("createState without types", () => {
    const s = createState();
    s.data.name = "test";
    expect(s.data.name).toBe("test");
  });

  test("it types network", () => {
    // This Network should be fully typed.
    const network = createNetwork<Shape>({
      name: "test",
      agents: [],
      defaultRouter: (opts) => {
        if (!opts.network.state.data.category) {
          // XXX: Run the categorization agent to classify which type of request this is.
        }
        return undefined;
      },
    });

    network.state.data.category = "refund";
    network.state.data.sku = 123;

    expect(network.state.data.category).toBe("refund");
    expect(network.state.data.sku).toBe(123);
  });

  test("typed tools", () => {
    const tool = createTool({
      name: "set_sku",
      description: "sets a sku",
      parameters: z.object({ sku: z.number() }),
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      handler: (_input, _opts: Tool.Options<Shape>) => {
        // input and opts are now fully typed generic tools.
      },
    });

    createAgent<Shape>({
      name: "foo",
      system: "you are an agent!",
      tools: [
        tool,
        createTool({
          name: "test",
          description: "test",
          parameters: z.object({ title: z.string() }),
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          handler: (_input, _opts: Tool.Options<Shape>) => {
            // input and _opts are still typed.
          },
        }),
      ],
    });

    createAgent<{ name: string }>({
      name: "foo",
      system: "you are an agent!",
      tools: [tool],
    });
  });
});
