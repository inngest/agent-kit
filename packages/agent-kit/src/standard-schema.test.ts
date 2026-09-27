import { describe, test, expect } from "vitest";
import * as v from "valibot";
import { toStandardJsonSchema } from "@valibot/to-json-schema";
import * as z from "zod";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { createTool } from "./tool";
import { toolParametersToJSONSchema } from "./util";

describe("Standard Schema support", () => {
  describe("Valibot", () => {
    test("createTool accepts Valibot schema", () => {
      const searchTool = createTool({
        name: "search",
        description: "Web search",
        parameters: toStandardJsonSchema(v.object({
          query: v.pipe(v.string(), v.description("Search query")),
        })),
        handler: async ({ query }) => {
          expect(typeof query).toBe("string");
          return { results: [] };
        },
      });

      expect(searchTool.name).toBe("search");
      expect(searchTool.description).toBe("Web search");
      expect(searchTool.parameters).toBeDefined();
    });

    test("Valibot schema converts to JSON Schema", () => {
      const schema = v.object({
        query: v.pipe(v.string(), v.description("Search query")),
        limit: v.optional(v.number(), 10),
      });

      const standardSchema = toStandardJsonSchema(schema);
      const jsonSchema = toolParametersToJSONSchema(standardSchema, "draft-2020-12");

      expect(jsonSchema).toHaveProperty("type", "object");
      expect(jsonSchema).toHaveProperty("properties");
      expect(jsonSchema.properties).toHaveProperty("query");
      expect(jsonSchema.properties).toHaveProperty("limit");
    });

    test("Valibot schema converts to JSON Schema with draft-07 target", () => {
      const schema = v.object({
        query: v.pipe(v.string(), v.description("Search query")),
      });

      const standardSchema = toStandardJsonSchema(schema);
      const jsonSchema = toolParametersToJSONSchema(standardSchema, "draft-7");

      expect(jsonSchema).toHaveProperty("type", "object");
      expect(jsonSchema).toHaveProperty("properties");
      expect(jsonSchema.properties).toHaveProperty("query");
    });

    test("Valibot schema validates input", async () => {
      const schema = v.object({
        query: v.pipe(v.string(), v.description("Search query")),
      });

      const result = schema["~standard"].validate({ query: "test" });
      const resolved = result instanceof Promise ? await result : result;
      expect(resolved).toHaveProperty("value");
      expect((resolved as { value: unknown }).value).toEqual({ query: "test" });
    });
  });

  describe("Zod (regression)", () => {
    test("createTool still accepts Zod schema", () => {
      const searchTool = createTool({
        name: "search",
        description: "Web search",
        parameters: z.object({
          query: z.string().describe("Search query"),
        }),
        handler: async ({ query }) => {
          expect(typeof query).toBe("string");
          return { results: [] };
        },
      });

      expect(searchTool.name).toBe("search");
      expect(searchTool.description).toBe("Web search");
      expect(searchTool.parameters).toBeDefined();
    });

    test("Zod schema converts to JSON Schema", () => {
      const schema = z.object({
        query: z.string().describe("Search query"),
        limit: z.number().optional().default(10),
      });

      const jsonSchema = toolParametersToJSONSchema(schema, "draft-7");

      expect(jsonSchema).toHaveProperty("type", "object");
      expect(jsonSchema).toHaveProperty("properties");
      expect(jsonSchema.properties).toHaveProperty("query");
      expect(jsonSchema.properties).toHaveProperty("limit");
    });

    test("Zod schema validates input", async () => {
      const schema = z.object({
        query: z.string().describe("Search query"),
      });

      const result = schema["~standard"].validate({ query: "test" });
      const resolved = result instanceof Promise ? await result : result;
      expect(resolved).toHaveProperty("value");
      expect((resolved as { value: unknown }).value).toEqual({ query: "test" });
    });
  });

  describe("toolParametersToJSONSchema", () => {
    test("throws error for unsupported schema", () => {
      const invalidSchema = {
        "~standard": {
          version: 1,
          vendor: "test",
          validate: () => ({ value: {} }),
        },
      } as unknown as StandardSchemaV1;

      expect(() =>
        toolParametersToJSONSchema(invalidSchema, "draft-7")
      ).toThrowError(/Standard Schema with JSON Schema support/);
    });

    test("supports draft-2020-12 target", () => {
      const schema = z.object({
        query: z.string(),
      });

      const jsonSchema = toolParametersToJSONSchema(schema, "draft-2020-12");
      expect(jsonSchema).toHaveProperty("type", "object");
    });

    test("supports openapi-3.0 target", () => {
      const schema = z.object({
        query: z.string(),
      });

      const jsonSchema = toolParametersToJSONSchema(schema, "openapi-3.0");
      expect(jsonSchema).toHaveProperty("type", "object");
    });
  });
});
