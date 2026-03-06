import { describe, expect, test } from "vitest";
import { z } from "zod";
import { jsonSchemaToZod, type JSONSchema } from "./json-schema-to-zod";

describe("jsonSchemaToZod", () => {
  test("converts string type", () => {
    const schema: JSONSchema = { type: "string" };
    const zod = jsonSchemaToZod(schema);
    expect(zod.parse("hello")).toBe("hello");
    expect(() => zod.parse(123)).toThrow();
  });

  test("converts string with minLength and maxLength", () => {
    const schema: JSONSchema = { type: "string", minLength: 2, maxLength: 5 };
    const zod = jsonSchemaToZod(schema);
    expect(zod.parse("hi")).toBe("hi");
    expect(() => zod.parse("a")).toThrow();
    expect(() => zod.parse("toolong")).toThrow();
  });

  test("converts string with pattern", () => {
    const schema: JSONSchema = { type: "string", pattern: "^[a-z]+$" };
    const zod = jsonSchemaToZod(schema);
    expect(zod.parse("abc")).toBe("abc");
    expect(() => zod.parse("ABC")).toThrow();
  });

  test("converts string with email format", () => {
    const schema: JSONSchema = { type: "string", format: "email" };
    const zod = jsonSchemaToZod(schema);
    expect(zod.parse("test@example.com")).toBe("test@example.com");
    expect(() => zod.parse("not-an-email")).toThrow();
  });

  test("converts string enum", () => {
    const schema: JSONSchema = { type: "string", enum: ["a", "b", "c"] };
    const zod = jsonSchemaToZod(schema);
    expect(zod.parse("a")).toBe("a");
    expect(() => zod.parse("d")).toThrow();
  });

  test("converts number type", () => {
    const schema: JSONSchema = { type: "number" };
    const zod = jsonSchemaToZod(schema);
    expect(zod.parse(42)).toBe(42);
    expect(zod.parse(3.14)).toBe(3.14);
    expect(() => zod.parse("not a number")).toThrow();
  });

  test("converts integer type", () => {
    const schema: JSONSchema = { type: "integer" };
    const zod = jsonSchemaToZod(schema);
    expect(zod.parse(42)).toBe(42);
    expect(() => zod.parse(3.14)).toThrow();
  });

  test("converts number with min/max", () => {
    const schema: JSONSchema = { type: "number", minimum: 0, maximum: 100 };
    const zod = jsonSchemaToZod(schema);
    expect(zod.parse(50)).toBe(50);
    expect(() => zod.parse(-1)).toThrow();
    expect(() => zod.parse(101)).toThrow();
  });

  test("converts boolean type", () => {
    const schema: JSONSchema = { type: "boolean" };
    const zod = jsonSchemaToZod(schema);
    expect(zod.parse(true)).toBe(true);
    expect(zod.parse(false)).toBe(false);
    expect(() => zod.parse("true")).toThrow();
  });

  test("converts null type", () => {
    const schema: JSONSchema = { type: "null" };
    const zod = jsonSchemaToZod(schema);
    expect(zod.parse(null)).toBe(null);
    expect(() => zod.parse("null")).toThrow();
  });

  test("converts simple object", () => {
    const schema: JSONSchema = {
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "number" },
      },
      required: ["name"],
    };
    const zod = jsonSchemaToZod(schema);
    expect(zod.parse({ name: "John" })).toEqual({ name: "John" });
    expect(zod.parse({ name: "John", age: 30 })).toEqual({
      name: "John",
      age: 30,
    });
    expect(() => zod.parse({ age: 30 })).toThrow();
  });

  test("converts object without explicit type (with properties)", () => {
    const schema: JSONSchema = {
      properties: {
        format: { type: "string" },
      },
      required: ["format"],
    };
    const zod = jsonSchemaToZod(schema);
    expect(zod.parse({ format: "hello" })).toEqual({ format: "hello" });
    expect(() => zod.parse({})).toThrow();
  });

  test("converts array type", () => {
    const schema: JSONSchema = {
      type: "array",
      items: { type: "string" },
    };
    const zod = jsonSchemaToZod(schema);
    expect(zod.parse(["a", "b"])).toEqual(["a", "b"]);
    expect(() => zod.parse([1, 2])).toThrow();
  });

  test("converts array with min/max items", () => {
    const schema: JSONSchema = {
      type: "array",
      items: { type: "number" },
      minItems: 1,
      maxItems: 3,
    };
    const zod = jsonSchemaToZod(schema);
    expect(zod.parse([1])).toEqual([1]);
    expect(() => zod.parse([])).toThrow();
    expect(() => zod.parse([1, 2, 3, 4])).toThrow();
  });

  test("converts nested objects", () => {
    const schema: JSONSchema = {
      type: "object",
      properties: {
        address: {
          type: "object",
          properties: {
            street: { type: "string" },
            city: { type: "string" },
          },
          required: ["street", "city"],
        },
      },
      required: ["address"],
    };
    const zod = jsonSchemaToZod(schema);
    expect(
      zod.parse({ address: { street: "123 Main St", city: "Springfield" } })
    ).toEqual({ address: { street: "123 Main St", city: "Springfield" } });
    expect(() => zod.parse({ address: { street: "123 Main St" } })).toThrow();
  });

  test("converts nullable type via type array", () => {
    const schema: JSONSchema = { type: ["string", "null"] };
    const zod = jsonSchemaToZod(schema);
    expect(zod.parse("hello")).toBe("hello");
    expect(zod.parse(null)).toBe(null);
    expect(() => zod.parse(123)).toThrow();
  });

  test("converts oneOf combinator", () => {
    const schema: JSONSchema = {
      oneOf: [{ type: "string" }, { type: "number" }],
    };
    const zod = jsonSchemaToZod(schema);
    expect(zod.parse("hello")).toBe("hello");
    expect(zod.parse(42)).toBe(42);
    expect(() => zod.parse(true)).toThrow();
  });

  test("converts anyOf combinator", () => {
    const schema: JSONSchema = {
      anyOf: [{ type: "string" }, { type: "number" }],
    };
    const zod = jsonSchemaToZod(schema);
    expect(zod.parse("hello")).toBe("hello");
    expect(zod.parse(42)).toBe(42);
  });

  test("converts allOf combinator for objects", () => {
    const schema: JSONSchema = {
      allOf: [
        {
          type: "object",
          properties: { name: { type: "string" } },
          required: ["name"],
        },
        {
          type: "object",
          properties: { age: { type: "number" } },
          required: ["age"],
        },
      ],
    };
    const zod = jsonSchemaToZod(schema);
    expect(zod.parse({ name: "John", age: 30 })).toEqual({
      name: "John",
      age: 30,
    });
  });

  test("converts enum without type", () => {
    const schema: JSONSchema = { enum: ["red", "green", "blue"] };
    const zod = jsonSchemaToZod(schema);
    expect(zod.parse("red")).toBe("red");
    expect(() => zod.parse("yellow")).toThrow();
  });

  test("handles unknown type as z.any()", () => {
    const schema: JSONSchema = {};
    const zod = jsonSchemaToZod(schema);
    expect(zod.parse("anything")).toBe("anything");
    expect(zod.parse(42)).toBe(42);
    expect(zod.parse(null)).toBe(null);
  });

  test("converts MCP-style tool input schema (format property as string)", () => {
    // This is the exact schema from the MCP test
    const schema: JSONSchema = {
      type: "object",
      properties: {
        format: { type: "string" },
      },
      required: ["format"],
    };
    const zod = jsonSchemaToZod(schema);
    expect(zod.parse({ format: "%s" })).toEqual({ format: "%s" });
    expect(() => zod.parse({})).toThrow();
    expect(() => zod.parse({ format: 123 })).toThrow();
  });

  test("converts object with additionalProperties: true", () => {
    const schema: JSONSchema = {
      type: "object",
      properties: {
        name: { type: "string" },
      },
      required: ["name"],
      additionalProperties: true,
    };
    const zod = jsonSchemaToZod(schema);
    expect(zod.parse({ name: "John", extra: "data" })).toEqual({
      name: "John",
      extra: "data",
    });
  });

  test("converts multi-type array (union)", () => {
    const schema: JSONSchema = { type: ["string", "number"] };
    const zod = jsonSchemaToZod(schema);
    expect(zod.parse("hello")).toBe("hello");
    expect(zod.parse(42)).toBe(42);
    expect(() => zod.parse(true)).toThrow();
  });

  test("converts number enum", () => {
    const schema: JSONSchema = { type: "number", enum: [1, 2, 3] };
    const zod = jsonSchemaToZod(schema);
    expect(zod.parse(1)).toBe(1);
    expect(zod.parse(2)).toBe(2);
    expect(() => zod.parse(4)).toThrow();
  });
});
