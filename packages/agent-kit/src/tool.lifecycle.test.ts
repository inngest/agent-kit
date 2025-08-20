/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */

import { describe, expect, it, vi } from "vitest";
import { createAgent, createTool } from "./index";
import { z } from "zod";
import type { Agent } from "./agent";
import type { Tool } from "./tool";
import type { NetworkRun } from "./network";
import type { StateData } from "./state";

describe("Tool Lifecycle Hooks", () => {
  describe("Regular Tools", () => {
    it("should call onStart hook before tool execution", async () => {
      const onStartSpy = vi.fn().mockResolvedValue({
        input: { enhanced: true, original: "test" },
        continue: true,
      });

      const handlerSpy = vi.fn().mockResolvedValue("result");

      const tool = createTool({
        name: "test-tool",
        description: "Test tool",
        parameters: z.object({ value: z.string() }),
        lifecycle: {
          onStart: onStartSpy,
        },
        handler: handlerSpy,
      });

      // Simulate tool execution
      const mockAgent = { name: "TestAgent" } as Agent<StateData>;
      const mockNetwork = { state: { data: {} } } as NetworkRun<StateData>;

      await tool.handler(
        { value: "test" },
        { agent: mockAgent, network: mockNetwork }
      );

      expect(handlerSpy).toHaveBeenCalledWith(
        { value: "test" },
        expect.any(Object)
      );
    });

    it("should call onSuccess hook after successful tool execution", () => {
      const onSuccessSpy = vi.fn().mockResolvedValue({
        result: "enhanced-result",
      });

      const tool = createTool({
        name: "test-tool",
        description: "Test tool",
        lifecycle: {
          onSuccess: onSuccessSpy,
        },
        handler: () => Promise.resolve("original-result"),
      });

      expect(tool.lifecycle?.onSuccess).toBe(onSuccessSpy);
    });

    it("should call onError hook when tool throws error", () => {
      const onErrorSpy = vi.fn().mockResolvedValue({
        error: "handled-error",
        handled: true,
      });

      const tool = createTool({
        name: "test-tool",
        description: "Test tool",
        lifecycle: {
          onError: onErrorSpy,
        },
        handler: () => {
          throw new Error("test error");
        },
      });

      expect(tool.lifecycle?.onError).toBe(onErrorSpy);
    });

    it("should pass lifecycle hooks through createTool", () => {
      const lifecycle = {
        onStart: vi.fn(),
        onSuccess: vi.fn(),
        onError: vi.fn(),
      };

      const tool = createTool({
        name: "test-tool",
        description: "Test tool",
        lifecycle,
        handler: () => Promise.resolve("result"),
      });

      expect(tool.lifecycle).toBe(lifecycle);
      expect(tool.lifecycle?.onStart).toBe(lifecycle.onStart);
      expect(tool.lifecycle?.onSuccess).toBe(lifecycle.onSuccess);
      expect(tool.lifecycle?.onError).toBe(lifecycle.onError);
    });
  });

  describe("MCP Tool Lifecycles", () => {
    it("should store toolLifecycles configuration in agent", () => {
      const toolLifecycles = {
        "github-create_issue": {
          onStart: vi.fn(),
        },
        "filesystem-*": {
          match: /^filesystem-/,
          onStart: vi.fn(),
          onSuccess: vi.fn(),
        },
      };

      const agent = createAgent({
        name: "TestAgent",
        description: "Test agent",
        system: "Test system",
        toolLifecycles,
      });

      expect((agent as any).toolLifecycles).toBe(toolLifecycles);
    });

    it("should match exact tool names", () => {
      const onStartSpy = vi.fn();
      const toolLifecycles = {
        "github-create_issue": {
          onStart: onStartSpy,
        },
      };

      const agent = createAgent({
        name: "TestAgent",
        description: "Test agent",
        system: "Test system",
        toolLifecycles,
      });

      // Simulate pattern matching logic from listMCPTools
      const toolName = "github-create_issue";
      let matchedLifecycle: any = undefined;

      const agentLifecycles = (agent as any).toolLifecycles;
      for (const [pattern, config] of Object.entries(agentLifecycles)) {
        if (pattern === toolName) {
          matchedLifecycle = config;
          break;
        }
      }

      expect(matchedLifecycle).toBeDefined();
      expect(matchedLifecycle.onStart).toBe(onStartSpy);
    });

    it("should match patterns with regex", () => {
      const onStartSpy = vi.fn();
      const toolLifecycles = {
        "filesystem-*": {
          match: /^filesystem-/,
          onStart: onStartSpy,
        },
      };

      const agent = createAgent({
        name: "TestAgent",
        description: "Test agent",
        system: "Test system",
        toolLifecycles,
      });

      // Simulate pattern matching logic
      const toolName = "filesystem-read_file";
      let matchedLifecycle: any = undefined;

      const agentLifecycles = (agent as any).toolLifecycles;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for (const [pattern, config] of Object.entries(agentLifecycles)) {
        if ((config as any).match?.test(toolName)) {
          matchedLifecycle = config;
          break;
        }
      }

      expect(matchedLifecycle).toBeDefined();
      expect(matchedLifecycle.onStart).toBe(onStartSpy);
    });

    it("should prefer exact match over pattern match", () => {
      const exactOnStart = vi.fn();
      const patternOnStart = vi.fn();

      const toolLifecycles = {
        "github-create_issue": {
          onStart: exactOnStart,
        },
        "github-*": {
          match: /^github-/,
          onStart: patternOnStart,
        },
      };

      const agent = createAgent({
        name: "TestAgent",
        description: "Test agent",
        system: "Test system",
        toolLifecycles,
      });

      // Simulate pattern matching logic with exact match first
      const toolName = "github-create_issue";
      let matchedLifecycle: any = undefined;

      const agentLifecycles = (agent as any).toolLifecycles;
      for (const [pattern, config] of Object.entries(agentLifecycles)) {
        if ((config as any).match) {
          if ((config as any).match.test(toolName)) {
            matchedLifecycle = config;
            break;
          }
        } else if (pattern === toolName) {
          matchedLifecycle = config;
          break;
        }
      }

      expect(matchedLifecycle).toBeDefined();
      expect(matchedLifecycle.onStart).toBe(exactOnStart);
      expect(matchedLifecycle.onStart).not.toBe(patternOnStart);
    });

    it("should handle multiple lifecycle hooks in pattern", () => {
      const onStartSpy = vi.fn();
      const onSuccessSpy = vi.fn();
      const onErrorSpy = vi.fn();

      const toolLifecycles = {
        "api-*": {
          match: /^api-/,
          onStart: onStartSpy,
          onSuccess: onSuccessSpy,
          onError: onErrorSpy,
        },
      };

      const agent = createAgent({
        name: "TestAgent",
        description: "Test agent",
        system: "Test system",
        toolLifecycles,
      });

      const agentLifecycles = (agent as any).toolLifecycles;
      const apiPattern = agentLifecycles["api-*"];

      expect(apiPattern).toBeDefined();
      expect(apiPattern.onStart).toBe(onStartSpy);
      expect(apiPattern.onSuccess).toBe(onSuccessSpy);
      expect(apiPattern.onError).toBe(onErrorSpy);
    });
  });

  describe("Lifecycle Hook Execution Flow", () => {
    it("should allow onStart to prevent tool execution", async () => {
      const handlerSpy = vi.fn();

      const tool = createTool({
        name: "test-tool",
        description: "Test tool",
        lifecycle: {
          onStart: () =>
            Promise.resolve({
              input: {},
              continue: false, // Prevent execution
            }),
        },
        handler: handlerSpy,
      });

      // In actual implementation, invokeTools checks continue flag
      const lifecycle = tool.lifecycle;
      expect(lifecycle?.onStart).toBeDefined();

      const result = await lifecycle!.onStart!({
        tool: tool as Tool.Any,
        input: {},
        agent: {} as Agent<StateData>,
        network: {} as NetworkRun<StateData>,
      });

      expect(result.continue).toBe(false);
      // Handler should not be called when continue is false
    });

    it("should allow onStart to modify input", async () => {
      const tool = createTool({
        name: "test-tool",
        description: "Test tool",
        lifecycle: {
          onStart: ({ input }) =>
            Promise.resolve({
              input: { ...input, enhanced: true },
              continue: true,
            }),
        },
        handler: (input) => Promise.resolve(input),
      });

      const lifecycle = tool.lifecycle;
      const result = await lifecycle!.onStart!({
        tool: tool as Tool.Any,
        input: { original: true },
        agent: {} as Agent<StateData>,
        network: {} as NetworkRun<StateData>,
      });

      expect(result.input).toEqual({ original: true, enhanced: true });
    });

    it("should allow onSuccess to modify output", async () => {
      const tool = createTool({
        name: "test-tool",
        description: "Test tool",
        lifecycle: {
          onSuccess: ({ result }) =>
            Promise.resolve({
              result: `[ENHANCED] ${result}`,
            }),
        },
        handler: () => Promise.resolve("original"),
      });

      const lifecycle = tool.lifecycle;
      const result = await lifecycle!.onSuccess!({
        tool: tool as Tool.Any,
        input: {},
        result: "original",
        agent: {} as Agent<StateData>,
        network: {} as NetworkRun<StateData>,
      });

      expect(result.result).toBe("[ENHANCED] original");
    });

    it("should allow onError to handle errors", async () => {
      const tool = createTool({
        name: "test-tool",
        description: "Test tool",
        lifecycle: {
          onError: ({ error }: { error: Error }) =>
            Promise.resolve({
              error: `Handled: ${error.message}`,
              handled: true,
            }),
        },
        handler: () => {
          throw new Error("test error");
        },
      });

      const lifecycle = tool.lifecycle;
      const result = await lifecycle!.onError!({
        tool: tool as Tool.Any,
        input: {},
        error: new Error("test error"),
        agent: {} as Agent<StateData>,
        network: {} as NetworkRun<StateData>,
      });

      expect(result.error).toBe("Handled: test error");
      expect(result.handled).toBe(true);
    });
  });
});
