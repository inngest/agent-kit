import { Tool } from "../types";

export * from "./computeruse/computeruse";

export const isBuiltin = (t: Tool.Any): boolean => {
  return (t as Tool.Builtin<any>).builtin === true;
}

export const asBuiltin = <T>(tool: Tool.Any): Tool.Builtin<T> => {
  if (isBuiltin(tool)) {
    return tool as Tool.Builtin<T>;
  }
  throw new Error("tool is not a builtin");
}
