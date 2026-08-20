import { z, type ZodType } from "zod";

/**
 * JSONSchema type representing a JSON Schema object.
 * Supports standard JSON Schema properties used by MCP tool definitions.
 */
export interface JSONSchema {
  type?: string | string[];
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema | JSONSchema[];
  required?: string[];
  enum?: (string | number | boolean | null)[];
  const?: string | number | boolean | null;
  format?: string;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  oneOf?: JSONSchema[];
  allOf?: JSONSchema[];
  anyOf?: JSONSchema[];
  not?: JSONSchema;
  additionalProperties?: boolean | JSONSchema;
  description?: string;
  default?: unknown;
  nullable?: boolean;
  if?: JSONSchema;
  then?: JSONSchema;
  else?: JSONSchema;
  [key: string]: unknown;
}

/**
 * Converts a JSON Schema to a Zod schema.
 *
 * This is a self-contained replacement for `@dmitryrechkin/json-schema-to-zod`
 * that works natively with zod v4.
 */
export function jsonSchemaToZod(schema: JSONSchema): ZodType {
  return parseSchema(schema);
}

function parseSchema(schema: JSONSchema): ZodType {
  // Handle array of types (e.g., ['string', 'null'] for nullable types)
  if (Array.isArray(schema.type)) {
    return handleTypeArray(schema);
  }

  // Handle combinators (oneOf, anyOf, allOf)
  if (schema.oneOf || schema.anyOf || schema.allOf) {
    return parseCombinator(schema);
  }

  // Handle object schema without explicit type but with properties
  if (schema.properties && (!schema.type || schema.type === "object")) {
    return parseObject(schema);
  }

  // Handle all other types
  return handleSingleType(schema);
}

function handleTypeArray(schema: JSONSchema): ZodType {
  const types = schema.type as string[];
  const isNullable = types.includes("null");
  const nonNullTypes = types.filter((t) => t !== "null");

  if (nonNullTypes.length === 0) {
    return z.null();
  }

  if (nonNullTypes.length === 1) {
    const inner = handleSingleType({ ...schema, type: nonNullTypes[0] });
    return isNullable ? inner.nullable() : inner;
  }

  // Union of multiple types
  const schemas = nonNullTypes.map((t) =>
    handleSingleType({ ...schema, type: t })
  );
  const union = z.union(schemas as [ZodType, ZodType, ...ZodType[]]);
  return isNullable ? union.nullable() : union;
}

function handleSingleType(schema: JSONSchema): ZodType {
  if (schema.type === undefined) {
    if (schema.oneOf || schema.anyOf || schema.allOf) {
      return parseCombinator(schema);
    }
    if (schema.properties) {
      return parseObject(schema);
    }
    if (schema.enum) {
      return parseEnum(schema);
    }
    return z.any();
  }

  switch (schema.type) {
    case "string":
      return parseString(schema);
    case "number":
    case "integer":
      return parseNumber(schema);
    case "boolean":
      return z.boolean();
    case "array":
      return parseArray(schema);
    case "object":
      return parseObject(schema);
    case "null":
      return z.null();
    default:
      return z.any();
  }
}

function parseString(schema: JSONSchema): ZodType {
  let s = z.string();

  if (schema.minLength !== undefined) {
    s = s.min(schema.minLength);
  }
  if (schema.maxLength !== undefined) {
    s = s.max(schema.maxLength);
  }
  if (schema.pattern) {
    s = s.regex(new RegExp(schema.pattern));
  }

  if (schema.format) {
    switch (schema.format) {
      case "email":
        s = s.email();
        break;
      case "uri":
      case "url":
        s = s.url();
        break;
      case "uuid":
        s = s.uuid();
        break;
      case "date-time":
        s = s.datetime();
        break;
      case "ipv4":
        s = s.regex(/^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/);
        break;
      case "ipv6":
        s = s.regex(/^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/);
        break;
    }
  }

  if (schema.enum) {
    return z.enum(schema.enum as [string, ...string[]]);
  }

  return applyNullable(s, schema);
}

function parseNumber(schema: JSONSchema): ZodType {
  let n = schema.type === "integer" ? z.int() : z.number();

  if (schema.minimum !== undefined) {
    n = n.min(schema.minimum);
  }
  if (schema.maximum !== undefined) {
    n = n.max(schema.maximum);
  }
  if (schema.exclusiveMinimum !== undefined) {
    n = n.min(schema.exclusiveMinimum + (schema.type === "integer" ? 1 : Number.MIN_VALUE));
  }
  if (schema.exclusiveMaximum !== undefined) {
    n = n.max(schema.exclusiveMaximum - (schema.type === "integer" ? 1 : Number.MIN_VALUE));
  }
  if (schema.multipleOf !== undefined) {
    n = n.multipleOf(schema.multipleOf);
  }

  if (schema.enum) {
    const values = schema.enum as number[];
    if (values.length >= 2) {
      return z.union(
        values.map((v) => z.literal(v)) as unknown as [ZodType, ZodType, ...ZodType[]]
      );
    }
    if (values.length === 1) {
      return z.literal(values[0]!);
    }
  }

  return applyNullable(n, schema);
}

function parseArray(schema: JSONSchema): ZodType {
  let itemSchema: ZodType = z.any();

  if (schema.items) {
    if (Array.isArray(schema.items)) {
      // Tuple validation
      const tupleSchemas = schema.items.map((item) => parseSchema(item));
      return z.tuple(tupleSchemas as [ZodType, ...ZodType[]]);
    } else {
      itemSchema = parseSchema(schema.items);
    }
  }

  let a = z.array(itemSchema);

  if (schema.minItems !== undefined) {
    a = a.min(schema.minItems);
  }
  if (schema.maxItems !== undefined) {
    a = a.max(schema.maxItems);
  }

  return applyNullable(a, schema);
}

function parseObject(schema: JSONSchema): ZodType {
  const shape: Record<string, ZodType> = {};
  const required = new Set(schema.required || []);

  if (schema.properties) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      let prop = parseSchema(propSchema);
      if (!required.has(key)) {
        prop = prop.optional();
      }
      shape[key] = prop;
    }
  }

  let obj = z.object(shape);

  if (schema.additionalProperties === true) {
    obj = obj.passthrough();
  } else if (
    schema.additionalProperties !== undefined &&
    schema.additionalProperties !== false &&
    typeof schema.additionalProperties === "object"
  ) {
    obj = obj.passthrough();
  }

  return applyNullable(obj, schema);
}

function parseCombinator(schema: JSONSchema): ZodType {
  if (schema.allOf && schema.allOf.length > 0) {
    // allOf = intersection of all schemas
    const schemas = schema.allOf.map((s) => parseSchema(s));
    return schemas.reduce((acc, s) => z.intersection(acc, s));
  }

  if (schema.oneOf && schema.oneOf.length > 0) {
    const schemas = schema.oneOf.map((s) => parseSchema(s));
    if (schemas.length === 1) {
      return schemas[0]!;
    }
    return z.union(schemas as [ZodType, ZodType, ...ZodType[]]);
  }

  if (schema.anyOf && schema.anyOf.length > 0) {
    const schemas = schema.anyOf.map((s) => parseSchema(s));
    if (schemas.length === 1) {
      return schemas[0]!;
    }
    return z.union(schemas as [ZodType, ZodType, ...ZodType[]]);
  }

  return z.any();
}

function parseEnum(schema: JSONSchema): ZodType {
  if (!schema.enum || schema.enum.length === 0) {
    return z.any();
  }

  // If all values are strings, use z.enum
  if (schema.enum.every((v) => typeof v === "string")) {
    return z.enum(schema.enum as [string, ...string[]]);
  }

  // Otherwise, use union of literals
  const literals = schema.enum.map((v) => z.literal(v as string | number | boolean));
  if (literals.length === 1) {
    return literals[0]!;
  }
  return z.union(literals as unknown as [ZodType, ZodType, ...ZodType[]]);
}

function applyNullable(schema: ZodType, jsonSchema: JSONSchema): ZodType {
  if (jsonSchema.nullable) {
    return schema.nullable();
  }
  return schema;
}
