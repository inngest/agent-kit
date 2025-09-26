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
