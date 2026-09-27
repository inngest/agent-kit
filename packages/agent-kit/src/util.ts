import { type Inngest, type InngestFunction, isInngestFunction } from "inngest";
import { type AsyncContext, getAsyncCtx } from "inngest/experimental";
import { type ZodType, ZodObject, ZodType as ZodTypeValue, z } from "zod";
import type { StandardSchemaV1 } from "@standard-schema/spec";

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
export type AnyZodType = ZodType;

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
  // The shape of the experimental async context changed across versions.
  // This is now stable, but we support both shapes here for compatibility.
  const asyncCtx = await getAsyncCtx();

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
  const ctx = asyncCtx?.ctx || (asyncCtx as any)?.execution?.ctx;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
  return ctx?.step;
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
  isZodObject: (value: unknown): value is ZodObject => {
    return value instanceof ZodObject;
  },

  isObject: (value: unknown): value is Record<string, unknown> => {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  },
};

export const toolParametersToJSONSchema = (
  schema: StandardSchemaV1 | ZodType,
  target: "draft-7" | "draft-2020-12" | "openapi-3.0"
): Record<string, unknown> => {
  const mappedTarget = target === "draft-7" ? "draft-07" : target;

  if (typeof schema === "object" && schema !== null && "~standard" in schema) {
    const standardSchema = schema as StandardSchemaV1;
    const props = standardSchema["~standard"] as unknown as Record<string, unknown>;
    if ("jsonSchema" in props && props.jsonSchema) {
      const converter = props.jsonSchema as { input: (opts: { target: string }) => Record<string, unknown> };
      return converter.input({ target: mappedTarget });
    }
  }

  if (schema instanceof ZodTypeValue) {
    return z.toJSONSchema(schema, { target });
  }

  throw new Error(
    `Schema of type "${schema?.constructor?.name ?? typeof schema}" does not implement ` +
    `Standard Schema with JSON Schema support ("~standard.jsonSchema"). ` +
    `If you're using Valibot, wrap it with toStandardJsonSchema() from @valibot/to-json-schema. ` +
    `If you're using another library, check whether it exposes a similar Standard JSON Schema adapter.`
  );
};
