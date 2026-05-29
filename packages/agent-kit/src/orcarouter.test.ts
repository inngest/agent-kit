import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { orcarouter } from "./orcarouter";

describe("orcarouter model helper", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    delete process.env.ORCAROUTER_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  test("uses the openai-chat format (reuses the OpenAI adapter)", () => {
    const model = orcarouter({ model: "orcarouter/auto" });
    expect(model.format).toBe("openai-chat");
  });

  test("defaults to the OrcaRouter base URL", () => {
    const model = orcarouter({ model: "orcarouter/auto" });
    expect(model.url).toBe("https://api.orcarouter.ai/v1/chat/completions");
  });

  test("respects a custom base URL", () => {
    const model = orcarouter({
      model: "openai/gpt-5.5",
      baseUrl: "https://gateway.internal/v1",
    });
    expect(model.url).toBe("https://gateway.internal/v1/chat/completions");
  });

  test("uses the explicitly provided apiKey", () => {
    const model = orcarouter({
      model: "orcarouter/auto",
      apiKey: "sk-orca-explicit",
    });
    expect(model.authKey).toBe("sk-orca-explicit");
  });

  test("falls back to the ORCAROUTER_API_KEY environment variable", () => {
    process.env.ORCAROUTER_API_KEY = "sk-orca-from-env";
    const model = orcarouter({ model: "orcarouter/auto" });
    expect(model.authKey).toBe("sk-orca-from-env");
  });

  test("does not fall back to OPENAI_API_KEY", () => {
    process.env.OPENAI_API_KEY = "sk-openai-should-not-leak";
    const model = orcarouter({ model: "orcarouter/auto" });
    expect(model.authKey).toBe("");
  });

  test("onCall sets the model and merges defaultParameters into the body", () => {
    const model = orcarouter({
      model: "orcarouter/auto",
      defaultParameters: { temperature: 0.5 },
    });

    const body: Record<string, unknown> = { messages: [] };
    model.onCall?.(model, body as never);

    expect(body.model).toBe("orcarouter/auto");
    expect(body.temperature).toBe(0.5);
  });
});
