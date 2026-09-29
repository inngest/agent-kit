import { describe, expect, it } from "vitest";
import { createAgent, createNetwork, openai } from "./index";

describe("Network streaming", () => {
  it("publishes run.failed and stream.ended when no agents are enabled", async () => {
    const model = openai({ model: "gpt-4o", apiKey: "test-key" });
    const network = createNetwork({
      name: "network",
      defaultModel: model,
      agents: [
        createAgent({
          name: "disabled",
          system: "system",
          lifecycle: { enabled: () => false },
        }),
      ],
      router: () => undefined,
    });

    const events: string[] = [];
    const publish = (chunk: { event: string }) => {
      events.push(chunk.event);
      return Promise.resolve();
    };

    await expect(
      network.run("hello", { streaming: { publish } })
    ).rejects.toThrow("no agents enabled in network");

    expect(events).toContain("run.started");
    expect(events).toContain("run.failed");
    expect(events[events.length - 1]).toBe("stream.ended");
  });
});
