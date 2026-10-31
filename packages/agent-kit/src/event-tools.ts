import { z } from "zod";
import { createTool } from "./tool";

type FilterValue = string | number | boolean;

export type EventSource = {
  description: string;
  /** The event.data fields that the agent may match by equality. */
  filters: z.ZodObject<Record<string, z.ZodType<FilterValue | undefined>>>;
  /** Fixed event.data constraints supplied by the application, not the model. */
  scope: Record<string, FilterValue>;
};

/**
 * Expose an application's event catalog and durable, single-event waits.
 * Use a catalog scoped to the current caller; Inngest owns matching and replay.
 */
export function createEventTools({
  events,
  maxTimeoutSeconds,
}: {
  events: Record<string, EventSource>;
  maxTimeoutSeconds: number;
}) {
  z.number().int().positive().parse(maxTimeoutSeconds);
  const scalar = z.union([z.string(), z.number(), z.boolean()]);
  const sources = new Map(
    Object.entries(events).map(([name, source]) => {
      z.string().min(1).parse(name);
      const filters = source.filters.partial().strict();
      return [
        name,
        {
          description: source.description,
          filters,
          schema: z.toJSONSchema(filters),
          scope: z.record(z.string(), scalar).parse(source.scope),
        },
      ] as const;
    })
  );
  const names = [...sources.keys()];
  if (!names.length) {
    throw new Error("createEventTools requires at least one event source");
  }
  const eventName = z.enum(names as [string, ...string[]]);
  const describeParameters = z.object({ event: eventName.optional() }).strict();
  const waitParameters = z
    .object({
      event: eventName,
      where: z
        .record(z.string(), scalar)
        .describe(
          "Equality filters on event.data. Discover allowed fields first. All filters must match."
        ),
      timeoutSeconds: z.number().int().positive().max(maxTimeoutSeconds),
    })
    .strict();

  const describe = createTool({
    name: "describe_events",
    description:
      "List available event sources or describe one source's filter fields. These are future events, not a search of past events.",
    parameters: describeParameters,
    handler: (input) => {
      const { event } = describeParameters.parse(input);
      return [...sources.entries()]
        .filter(([name]) => !event || name === event)
        .map(([name, source]) => ({
          event: name,
          description: source.description,
          filters: source.schema,
          fixedScopeFields: Object.keys(source.scope),
          maxTimeoutSeconds,
        }));
    },
  });

  const wait = createTool({
    name: "wait_for_event",
    description:
      "Pause until one future event matches the chosen source and all equality filters, or the timeout expires. Application scope always applies. Returns the event to continue this task. Repeated waits do not buffer events between waits.",
    parameters: waitParameters,
    handler: async (input, { step }) => {
      const { event, where, timeoutSeconds } = waitParameters.parse(input);
      const source = sources.get(event)!;
      const filters = source.filters.parse(where);
      if (!step) {
        throw new Error("wait_for_event requires an Inngest function context");
      }
      const selected = Object.fromEntries(
        Object.keys(where).map((field) => [field, filters[field]])
      );
      for (const [field, value] of Object.entries(selected)) {
        if (
          value !== undefined &&
          Object.prototype.hasOwnProperty.call(source.scope, field) &&
          source.scope[field] !== value
        ) {
          throw new Error(`Cannot override application scope field: ${field}`);
        }
      }

      // Encode data as CEL literals, never interpolate model-authored expressions.
      const expression = Object.entries({ ...selected, ...source.scope })
        .filter(([, value]) => value !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(
          ([field, value]) =>
            `async.data[${JSON.stringify(field)}] == ${JSON.stringify(value)}`
        )
        .join(" && ");
      const result = await step.waitForEvent("agent-wait-for-event", {
        event,
        timeout: `${timeoutSeconds}s`,
        if: expression || "true",
      });
      return result === null
        ? { status: "timed_out" as const, event: null }
        : { status: "matched" as const, event: result };
    },
  });

  return [describe, wait] as [typeof describe, typeof wait];
}
