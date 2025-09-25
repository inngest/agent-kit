import { type Inngest } from "inngest";
import { type InngestFunction, isInngestFunction } from "inngest";
import { getAsyncCtx, type AsyncContext } from "inngest/experimental";
import { ZodType, type ZodObject, type ZodTypeAny } from "zod";

export type MaybePromise<T> = T | Promise<T>;

/**
 * AnyZodType is a type alias for any Zod type.
 *
 * It specifically matches the typing used for the OpenAI JSON schema typings,
 * which do not use the standardized `z.ZodTypeAny` type.
 *
 * Not that using this type directly can break between any versions of Zod
 * (including minor and patch versions). It may be pertinent to maintain a
 * custom type which matches many versions in the future.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyZodType = ZodType<any> | ZodTypeAny;

/**
 * Given an unknown value, return a string representation of the error if it is
 * an error, otherwise return the stringified value.
 */
export const stringifyError = (e: unknown): string => {
  if (e instanceof Error) {
    return e.message;
  }

  return String(e);
};

/**
 * Attempts to retrieve the step tools from the async context.
 */
export const getStepTools = async (): Promise<
  AsyncContext["ctx"]["step"] | undefined
> => {
  const asyncCtx = await getAsyncCtx();

  return asyncCtx?.ctx.step;
};

export const isInngestFn = (fn: unknown): fn is InngestFunction.Any => {
  // Derivation of `InngestFunction` means it's definitely correct
  if (isInngestFunction(fn)) {
    return true;
  }

  // If it's not derived from `InngestFunction`, it could still be a function
  // but from a different version of the library. Depending on your other deps
  // this could be likely and multiple versions of the `inngest` package are
  // installed at the same time. Thus, we check the generic shape here instead.
  if (
    typeof fn === "object" &&
    fn !== null &&
    "createExecution" in fn &&
    typeof fn.createExecution === "function"
  ) {
    return true;
  }

  return false;
};

export const getInngestFnInput = (
  fn: InngestFunction.Any
): AnyZodType | undefined => {
  const runtimeSchemas = (fn["client"] as Inngest.Any)["schemas"]?.[
    "runtimeSchemas"
  ];
  if (!runtimeSchemas) {
    return;
  }

  const schemasToAttempt = new Set<string>(
    (fn["opts"] as InngestFunction.Options).triggers?.reduce((acc, trigger) => {
      if (trigger.event) {
        return [...acc, trigger.event];
      }

      return acc;
    }, [] as string[]) ?? []
  );

  if (!schemasToAttempt.size) {
    return;
  }

  let schema: AnyZodType | undefined;

  for (const eventSchema of schemasToAttempt) {
    const runtimeSchema = runtimeSchemas[eventSchema];

    // We only support Zod atm
    if (
      typeof runtimeSchema === "object" &&
      runtimeSchema !== null &&
      "data" in runtimeSchema &&
      helpers.isZodObject(runtimeSchema.data)
    ) {
      if (schema) {
        schema = schema.or(runtimeSchema.data);
      } else {
        schema = runtimeSchema.data;
      }
      continue;
    }

    // TODO It could also be a regular object with inidivudal fields, so
    // validate that too
  }

  return schema;
};

const helpers = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  isZodObject: (value: unknown): value is ZodObject<any> => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return value instanceof ZodType && value._def.typeName === "ZodObject";
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  isObject: (value: unknown): value is Record<string, any> => {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  },
};

// Minimal local copy of the event payload type used when invoking Inngest
// functions as tools. This avoids importing from non-exported subpaths.
export type MinimalEventPayload = {
  // The payload data passed to the invoked function
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
};

export type SerializedError = {
  name: string;
  message: string;
  stack?: string;
  cause?: unknown;
  // Marker to indicate this object has been serialized
  __serialized?: true;
  // Preserve common extra fields (eg. error.code) without being overly loose
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

const SERIALIZED_KEY = "__serialized";
const SERIALIZED_VALUE = true as const;

const safeStringify = (value: unknown): string | undefined => {
  try {
    const seen = new WeakSet<object>();
    return JSON.stringify(
      value,
      (_k, v: unknown) => {
        if (typeof v === "object" && v !== null) {
          const obj = v;
          if (seen.has(obj)) return "[Circular]";
          seen.add(obj);
        }
        return v;
      },
      2
    );
  } catch {
    try {
      return String(value);
    } catch {
      return undefined;
    }
  }
};

export function serializeError(
  err: unknown,
  maxDepth = 5,
  seen: WeakSet<object> = new WeakSet()
): SerializedError {
  const make = (
    name: string,
    message: string,
    stack?: string,
    cause?: unknown
  ): SerializedError => {
    const out: SerializedError = {
      name,
      message,
      ...(stack ? { stack } : {}),
      [SERIALIZED_KEY]: SERIALIZED_VALUE,
    };
    if (cause !== undefined) {
      try {
        out.cause =
          maxDepth > 0
            ? serializeError(cause, maxDepth - 1, seen)
            : safeStringify(cause);
      } catch {
        out.cause = safeStringify(cause);
      }
    }
    return out;
  };

  try {
    if (typeof err === "object" && err !== null) {
      if (seen.has(err)) {
        return make("Error", "[Circular]");
      }
      seen.add(err);

      if ((err as SerializedError)[SERIALIZED_KEY] === SERIALIZED_VALUE) {
        // Already serialized; trust the input shape
        return err as SerializedError;
      }

      if (err instanceof Error) {
        // Build base from Error and copy enumerable own props (eg. code)
        const base = make(
          err.name || "Error",
          err.message || safeStringify(err) || "Unknown error",
          err.stack
        );

        const extras = err as unknown as Record<string, unknown>;
        for (const key in extras) {
          if (
            key === "name" ||
            key === "message" ||
            key === "stack" ||
            key === "cause"
          ) {
            continue;
          }
          base[key] = extras[key];
        }

        // Recursively serialize cause if present
        const anyErr = err as Error & { cause?: unknown };
        if (anyErr.cause !== undefined) {
          try {
            base.cause = serializeError(anyErr.cause, maxDepth - 1, seen);
          } catch {
            base.cause = safeStringify(anyErr.cause);
          }
        }

        return base;
      }

      // Non-Error object: do our best to capture something useful
      const msg = safeStringify(err) || "Unknown error; could not stringify";
      return make("Error", msg, "");
    }

    // Primitive throws (string, number, etc.)
    return make("Error", String(err));
  } catch {
    // Final fallback: produce a generic error
    return make(
      "Could not serialize source error",
      "Serializing the source error failed.",
      ""
    );
  }
}
