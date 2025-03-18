import { describe, expect, test } from "vitest";
import { createState } from "./state";
import { createNetwork } from "./network";

describe("createState", () => {
  test("createState with types", () => {
    interface State {
      category?: "refund" | "exchange";
      sku?: number;
    }

    const s = createState<State>();
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
    interface State {
      category?: "refund" | "exchange";
      sku?: number;
    }

    // This Network should be fully typed.
    const network = createNetwork<State>({
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
});
