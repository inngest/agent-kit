import { describe, expect, test } from "vitest";
import { recursiveGeminiZodToJsonSchema } from "./gemini";

// Utility to deep-clone objects without preserving references
const clone = <T>(obj: T): T => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const cloned: T = JSON.parse(JSON.stringify(obj));
  return cloned;
};

describe("recursiveGeminiZodToJsonSchema", () => {
  test("should remove additionalProperties when truthy at the top level", () => {
    const input = {
      type: "object",
      properties: { name: { type: "string" } },
      additionalProperties: true,
      required: ["name"],
    };
    const expected = {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    };

    expect(recursiveGeminiZodToJsonSchema(input)).toEqual(expected);
  });

  test("should remove additionalProperties when truthy from nested objects", () => {
    const input = {
      type: "object",
      properties: {
        user: {
          type: "object",
          properties: { id: { type: "number" } },
          additionalProperties: true,
        },
        isActive: { type: "boolean" },
      },
      additionalProperties: true,
    };
    const expected = {
      type: "object",
      properties: {
        user: {
          type: "object",
          properties: { id: { type: "number" } },
        },
        isActive: { type: "boolean" },
      },
    };

    expect(recursiveGeminiZodToJsonSchema(input)).toEqual(expected);
  });

  test("should remove additionalProperties from objects within an array when truthy", () => {
    const input = {
      type: "array",
      items: [
        {
          type: "object",
          properties: { sku: { type: "string" } },
          additionalProperties: true,
        },
        { type: "number" },
        {
          type: "object",
          properties: { count: { type: "integer" } },
          additionalProperties: true,
        },
        "a string",
        null,
        undefined,
      ],
      additionalProperties: "foo",
    };
    const expected = {
      type: "array",
      items: [
        {
          type: "object",
          properties: { sku: { type: "string" } },
        },
        { type: "number" },
        {
          type: "object",
          properties: { count: { type: "integer" } },
        },
        "a string",
        null,
        undefined,
      ],
    };

    expect(recursiveGeminiZodToJsonSchema(input)).toEqual(expected);
  });

  test("should handle deeply nested objects and arrays", () => {
    const input = {
      level1: {
        additionalProperties: true,
        level2: {
          prop: "value",
          additionalProperties: true,
          level3Array: [
            { item: 1, additionalProperties: true },
            { item: 2, otherProp: "data" },
            { item: 3, level4: { final: true, additionalProperties: true } },
            "stringInNestedArray",
          ],
        },
      },
    };
    const expected = {
      level1: {
        level2: {
          prop: "value",
          level3Array: [
            { item: 1 },
            { item: 2, otherProp: "data" },
            { item: 3, level4: { final: true } },
            "stringInNestedArray",
          ],
        },
      },
    };

    expect(recursiveGeminiZodToJsonSchema(input)).toEqual(expected);
  });

  test("should return the object unchanged if no additionalProperties exist", () => {
    const input = {
      type: "object",
      properties: {
        name: { type: "string" },
        details: {
          type: "object",
          properties: { age: { type: "number" } },
        },
      },
      required: ["name"],
    };
    const inputClone = clone(input);

    expect(recursiveGeminiZodToJsonSchema(input)).toEqual(inputClone);
  });

  test("should handle empty objects correctly", () => {
    const input = {};
    const expected = {};
    expect(recursiveGeminiZodToJsonSchema(input)).toEqual(expected);
  });

  test("should handle objects with null or undefined values correctly", () => {
    const input = {
      prop1: null,
      prop2: undefined,
      prop3: {
        nested: null,
        additionalProperties: true,
      },
      prop4: [null, undefined, { item: 1, additionalProperties: true }],
    };
    const expected = {
      prop1: null,
      prop2: undefined,
      prop3: {
        nested: null,
      },
      prop4: [null, undefined, { item: 1 }],
    };
    expect(recursiveGeminiZodToJsonSchema(input)).toEqual(expected);
  });

  test("should handle top-level arrays", () => {
    const input = [
      { foo: 1, additionalProperties: true },
      { bar: 2, additionalProperties: false },
      3,
      null,
      undefined,
      "string",
    ];
    const expected = [{ foo: 1 }, { bar: 2 }, 3, null, undefined, "string"];
    expect(recursiveGeminiZodToJsonSchema(input)).toEqual(expected);
  });

  test("should not modify the original input object", () => {
    const input = {
      type: "object",
      properties: { name: { type: "string" } },
      additionalProperties: true,
      nested: { prop: "value", additionalProperties: true },
      arr: [{ inner: true, additionalProperties: false }],
    };
    const inputClone = clone(input);

    recursiveGeminiZodToJsonSchema(input);
    expect(input).toEqual(inputClone);
  });
});
