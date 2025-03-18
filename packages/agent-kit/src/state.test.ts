import { describe, expect, test } from "vitest";
import { createState } from "./state";
import { createNetwork } from "./network";

describe("createState", () => {
  test("createState with types", () => {
    interface State {
      name?: string;
      age?: number;
    }

    const s = createState<State>();
    s.data.name = "test";
    s.data.age = 50;
    expect(s.data.name).toBe("test");
    expect(s.data.age).toBe(50);

    // This Network should be fully typed.
    const network = createNetwork<State>({
      name: "test",
      agents: [],
      defaultState: s,
      defaultRouter: () => {
        return undefined;
      },
    });

    expect(network.state.data.name).toBe("test");
    expect(network.state.data.age).toBe(50);
  });

  test("createState without types", () => {
    const s = createState();
    s.data.name = "test";
    expect(s.data.name).toBe("test");
  });
});
