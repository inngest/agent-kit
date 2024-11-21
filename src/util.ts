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
