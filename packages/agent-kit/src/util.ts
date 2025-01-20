import { type AsyncContext, getAsyncCtx } from "inngest/experimental";
import { type ZodType } from "zod";

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
export type AnyZodType = ZodType<any>;

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

export type StepTools = Awaited<ReturnType<typeof getStepTools>>;

/**
 * Given an object `T`, return a new object where all keys with function types
 * as values are genericized. If the value is an object, recursively apply this
 * transformation.
 */
export type GenericizeFunctionsInObject<T> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [K in keyof T]: T[K] extends (...args: any[]) => any
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (...args: any[]) => any
    : // eslint-disable-next-line @typescript-eslint/no-explicit-any
      T[K] extends Record<string, any>
      ? // Allow every object to also contain arbitrary additional properties.
        GenericizeFunctionsInObject<T[K]> & Record<string, unknown>
      : T[K];
};

export type Simplify<T> = { [KeyType in keyof T]: T[KeyType] } & {};

export type ConditionalSimplifyDeep<
  Type,
  ExcludeType = never,
  IncludeType = unknown,
> = Type extends ExcludeType
  ? Type
  : Type extends IncludeType
    ? {
        [TypeKey in keyof Type]: ConditionalSimplifyDeep<
          Type[TypeKey],
          ExcludeType,
          IncludeType
        >;
      }
    : Type;

export type SimplifyDeep<Type> = ConditionalSimplifyDeep<
  Type,
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  Function | Iterable<unknown>,
  object
>;
