import { describe, expect, test, vi } from "vitest";
import { z } from "zod";
import { createAgent } from "./agent";
import { createEventTools } from "./event-tools";
import { createNetwork, NetworkRun } from "./network";
import { createState } from "./state";
import { type Tool } from "./tool";

const options: Tool.Options<Record<string, unknown>> = {
  agent: createAgent({ name: "observer", system: "Observe events" }),
  network: new NetworkRun(
    createNetwork({ name: "observer", agents: [] }),
    createState()
  ),
};

function setup() {
  const tools = createEventTools({
    maxTimeoutSeconds: 3600,
    events: {
      "deployment/updated": {
        description: "Deployment progress",
        filters: z.object({
          status: z.enum(["running", "succeeded", "failed"]),
          service: z.string().describe("Service name"),
          tenantId: z.string(),
        }),
        scope: { tenantId: "tenant-a" },
      },
      "build/finished": {
        description: "Build results",
        filters: z.object({ passed: z.boolean(), attempt: z.number().int() }),
        scope: { tenantId: "tenant-a" },
      },
    },
  });
  const waitForEvent = vi.fn().mockResolvedValue(null);
  const opts = {
    ...options,
    step: { waitForEvent } as unknown as NonNullable<typeof options.step>,
  };
  return { describe: tools[0], wait: tools[1], waitForEvent, opts };
}

describe("createEventTools", () => {
  test("discovers source-specific filter schemas and limits", async () => {
    const { describe } = setup();
    const catalog = await describe.handler({}, options);
    expect(catalog.map((source) => source.event)).toEqual([
      "deployment/updated",
      "build/finished",
    ]);
    const selected = await describe.handler(
      { event: "deployment/updated" },
      options
    );
    expect(selected).toHaveLength(1);
    expect(selected[0]).toMatchObject({
      filters: {
        properties: {
          status: { enum: ["running", "succeeded", "failed"] },
          service: { description: "Service name", type: "string" },
        },
        additionalProperties: false,
      },
      fixedScopeFields: ["tenantId"],
      maxTimeoutSeconds: 3600,
    });
  });

  test("waits with application scope and returns the original event", async () => {
    const { wait, waitForEvent, opts } = setup();
    const event = {
      id: "event-1",
      name: "deployment/updated",
      data: { tenantId: "tenant-a", status: "succeeded", detail: "deployed" },
    };
    waitForEvent.mockResolvedValue(event);
    await expect(
      wait.handler(
        {
          event: "deployment/updated",
          where: { status: "succeeded" },
          timeoutSeconds: 600,
        },
        opts
      )
    ).resolves.toEqual({ status: "matched", event });
    expect(waitForEvent).toHaveBeenCalledTimes(1);
    expect(waitForEvent).toHaveBeenCalledWith("agent-wait-for-event", {
      event: "deployment/updated",
      timeout: "600s",
      if: 'async.data["status"] == "succeeded" && async.data["tenantId"] == "tenant-a"',
    });
  });

  test("retains scope when no additional filters are requested", async () => {
    const { wait, waitForEvent, opts } = setup();
    const result = await wait.handler(
      { event: "deployment/updated", where: {}, timeoutSeconds: 60 },
      opts
    );
    expect(result).toEqual({ status: "timed_out", event: null });
    expect(waitForEvent.mock.calls[0]?.[1]).toMatchObject({
      if: 'async.data["tenantId"] == "tenant-a"',
    });
  });

  test.each<{
    event: string;
    where: Record<string, string | number | boolean>;
    timeoutSeconds: number;
  }>([
    { event: "private/event", where: {}, timeoutSeconds: 60 },
    {
      event: "deployment/updated",
      where: { unknown: true },
      timeoutSeconds: 60,
    },
    {
      event: "deployment/updated",
      where: { status: "unknown" },
      timeoutSeconds: 60,
    },
    {
      event: "deployment/updated",
      where: { tenantId: "tenant-b" },
      timeoutSeconds: 60,
    },
    { event: "build/finished", where: { passed: "true" }, timeoutSeconds: 60 },
    { event: "build/finished", where: { attempt: 1.5 }, timeoutSeconds: 60 },
    { event: "deployment/updated", where: {}, timeoutSeconds: 3601 },
    { event: "deployment/updated", where: {}, timeoutSeconds: 0 },
    { event: "deployment/updated", where: {}, timeoutSeconds: 1.5 },
  ])("rejects invalid waits before registering: %j", async (input) => {
    const { wait, waitForEvent, opts } = setup();
    await expect(wait.handler(input, opts)).rejects.toThrow();
    expect(waitForEvent).not.toHaveBeenCalled();
  });

  test("encodes filter values as data instead of CEL expressions", async () => {
    const { wait, waitForEvent, opts } = setup();
    const value = '") || true //\n\\';
    await wait.handler(
      {
        event: "deployment/updated",
        where: { service: value },
        timeoutSeconds: 60,
      },
      opts
    );
    expect(waitForEvent.mock.calls[0]?.[1]).toMatchObject({
      if: `async.data["service"] == ${JSON.stringify(value)} && async.data["tenantId"] == "tenant-a"`,
    });
  });

  test("preserves scalar types and uses deterministic filter ordering", async () => {
    const { wait, waitForEvent, opts } = setup();
    await wait.handler(
      {
        event: "build/finished",
        where: { passed: false, attempt: 2 },
        timeoutSeconds: 60,
      },
      opts
    );
    expect(waitForEvent.mock.calls[0]?.[1]).toMatchObject({
      if: 'async.data["attempt"] == 2 && async.data["passed"] == false && async.data["tenantId"] == "tenant-a"',
    });
  });

  test("does not add unselected schema defaults to the predicate", async () => {
    const [, wait] = createEventTools({
      events: {
        "job/updated": {
          description: "Jobs",
          filters: z.object({ status: z.string().default("done") }),
          scope: { tenantId: "tenant-a" },
        },
      },
      maxTimeoutSeconds: 60,
    });
    const { opts, waitForEvent } = setup();
    await wait.handler(
      { event: "job/updated", where: {}, timeoutSeconds: 60 },
      opts
    );
    expect(waitForEvent.mock.calls[0]?.[1]).toMatchObject({
      if: 'async.data["tenantId"] == "tenant-a"',
    });
  });

  test("does not pretend to wait without a durable step context", async () => {
    const { wait } = setup();
    await expect(
      wait.handler(
        { event: "deployment/updated", where: {}, timeoutSeconds: 60 },
        options
      )
    ).rejects.toThrow("requires an Inngest function context");
  });

  test("propagates engine errors without turning them into timeouts", async () => {
    const { wait, waitForEvent, opts } = setup();
    const failure = new Error("wait registration failed");
    waitForEvent.mockRejectedValue(failure);
    await expect(
      wait.handler(
        { event: "deployment/updated", where: {}, timeoutSeconds: 60 },
        opts
      )
    ).rejects.toBe(failure);
  });
});
