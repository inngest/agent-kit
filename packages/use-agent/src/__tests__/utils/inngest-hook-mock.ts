import { vi } from "vitest";
export type InngestController = {
  push: (chunk: unknown) => void;
  setState: (s: unknown) => void;
  setError: (e: unknown) => void;
  reset: () => void;
};

let data: unknown[] = [];
let state: unknown = "Inactive";
let error: unknown = undefined;

export const controller: InngestController = {
  push: (chunk: unknown) => (data = [...data, chunk]),
  setState: (s: unknown) => (state = s),
  setError: (e: unknown) => (error = e),
  reset: () => {
    data = [];
    state = "Inactive";
    error = undefined;
  },
};

// Vitest module mock shim
vi.mock("@inngest/realtime/hooks", () => {
  return {
    useInngestSubscription: (opts: any) => ({ data, state, error, ...opts }),
  };
});

export {};


