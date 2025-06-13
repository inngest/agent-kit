import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { 
  initializeThread, 
  loadThreadFromStorage, 
  saveThreadToStorage,
  type HistoryConfig,
  type ThreadOperationConfig,
  type SaveThreadToStorageConfig
} from "./history";
import { createState, type State, type StateData } from "./state";
import { createNetwork, type NetworkRun } from "./network";
import { AgentResult, type Message } from "./types";

/**
 * Test state interface extending StateData for testing purposes.
 * 
 * @interface TestState
 * @extends {StateData}
 */
interface TestState extends StateData {
  /** User identifier for testing history functionality */
  userId?: string;
  /** Session identifier for testing conversation contexts */
  sessionId?: string;
}

/**
 * Mock getStepTools to return a consistent step object for testing.
 * This ensures tests don't depend on actual Inngest context.
 */
vi.mock("./util", () => ({
  getStepTools: vi.fn().mockResolvedValue({
    run: vi.fn((name: string, fn: () => any) => fn()),
    invoke: vi.fn(),
    sendEvent: vi.fn(),
  }),
}));

/**
 * Comprehensive test suite for the History module.
 * 
 * Tests all core functionality including thread initialization, 
 * history loading, result persistence, integration scenarios,
 * error handling, and edge cases.
 * 
 * @description
 * The History module manages conversation persistence in AgentKit,
 * providing hooks for thread creation, loading existing history,
 * and saving new results to storage systems.
 */
describe("History Module", () => {
  let mockNetwork: NetworkRun<TestState>;
  let mockState: State<TestState>;
  let mockHistoryConfig: HistoryConfig<TestState>;

  /**
   * Set up fresh mocks before each test to ensure test isolation.
   * Creates clean state, network, and history configuration objects.
   */
  beforeEach(() => {
    // Create fresh mocks for each test
    mockState = createState<TestState>({ userId: "test-user" });
    mockNetwork = {
      name: "test-network",
      state: mockState,
    } as NetworkRun<TestState>;

    mockHistoryConfig = {
      createThread: vi.fn(),
      get: vi.fn(),
      appendResults: vi.fn(),
    };

    // Clear any existing results
    mockState.setResults([]);
  });

  /**
   * Clean up mocks after each test to prevent test interference.
   */
  afterEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Test suite for the initializeThread function.
   * 
   * @description
   * Tests thread initialization logic including:
   * - Handling missing history configuration
   * - Creating new threads with custom createThread hooks
   * - Auto-generating threadIds when history.get is configured
   * - Preserving existing threadIds
   * 
   * @test {initializeThread}
   */
  describe("initializeThread", () => {
    /**
     * @test Should do nothing when no history config is provided
     * @description Verifies that initializeThread gracefully handles cases where no history configuration exists
     */
    test("should do nothing when no history config is provided", async () => {
      const config: ThreadOperationConfig<TestState> = {
        state: mockState,
        input: "test input",
        network: mockNetwork,
      };

      await initializeThread(config);

      expect(mockState.threadId).toBeUndefined();
    });

    /**
     * @test Should create new thread when no threadId and createThread hook exists
     * @description Tests the primary thread creation path using the createThread hook
     * @example
     * ```typescript
     * const historyConfig = {
     *   createThread: async ({ state, input }) => ({ threadId: "new-thread-123" })
     * };
     * ```
     */
    test("should create new thread when no threadId and createThread hook exists", async () => {
      const newThreadId = "new-thread-123";
      mockHistoryConfig.createThread = vi.fn().mockResolvedValue({ threadId: newThreadId });

      const config: ThreadOperationConfig<TestState> = {
        state: mockState,
        history: mockHistoryConfig,
        input: "test input",
        network: mockNetwork,
      };

      await initializeThread(config);

      expect(mockHistoryConfig.createThread).toHaveBeenCalledWith({
        state: mockState,
        network: mockNetwork,
        input: "test input",
        step: expect.any(Object),
      });
      expect(mockState.threadId).toBe(newThreadId);
    });

    /**
     * @test Should auto-generate threadId when history.get exists but no threadId provided
     * @description Tests the fallback behavior when history.get is configured but no custom createThread hook exists
     */
    test("should auto-generate threadId when history.get exists but no threadId provided", async () => {
      // Remove createThread but keep get
      mockHistoryConfig.createThread = undefined;
      mockHistoryConfig.get = vi.fn().mockResolvedValue([]);

      const config: ThreadOperationConfig<TestState> = {
        state: mockState,
        history: mockHistoryConfig,
        input: "test input",
        network: mockNetwork,
      };

      await initializeThread(config);

      expect(mockState.threadId).toBeDefined();
      expect(mockState.threadId).toMatch(/^[0-9a-f-]{36}$/); // UUID format
    });

    /**
     * @test Should call createThread after auto-generating threadId if createThread exists
     * @description Verifies that when both get and createThread are configured, both auto-generation and creation occur
     */
    test("should call createThread after auto-generating threadId if createThread exists", async () => {
      mockHistoryConfig.createThread = vi.fn().mockResolvedValue({ threadId: "ignored" });
      mockHistoryConfig.get = vi.fn().mockResolvedValue([]);

      const config: ThreadOperationConfig<TestState> = {
        state: mockState,
        history: mockHistoryConfig,
        input: "test input",
        network: mockNetwork,
      };

      await initializeThread(config);

      expect(mockHistoryConfig.createThread).toHaveBeenCalled();
      expect(mockState.threadId).toBeDefined();
    });

    /**
     * @test Should not modify existing threadId
     * @description Ensures that existing threadIds are preserved and not overwritten
     */
    test("should not modify existing threadId", async () => {
      const existingThreadId = "existing-thread-456";
      mockState.threadId = existingThreadId;
      mockHistoryConfig.createThread = vi.fn().mockResolvedValue({ threadId: "new-thread" });

      const config: ThreadOperationConfig<TestState> = {
        state: mockState,
        history: mockHistoryConfig,
        input: "test input",
        network: mockNetwork,
      };

      await initializeThread(config);

      expect(mockHistoryConfig.createThread).not.toHaveBeenCalled();
      expect(mockState.threadId).toBe(existingThreadId);
    });
  });

  /**
   * Test suite for the loadThreadFromStorage function.
   * 
   * @description
   * Tests conversation history loading including:
   * - Handling various configuration states
   * - Loading historical results from storage
   * - Respecting existing state to avoid overwrites
   * 
   * @test {loadThreadFromStorage}
   */
  describe("loadThreadFromStorage", () => {
    /**
     * @test Should do nothing when no history config is provided
     * @description Verifies graceful handling when no history configuration exists
     */
    test("should do nothing when no history config is provided", async () => {
      const config: ThreadOperationConfig<TestState> = {
        state: mockState,
        input: "test input",
        network: mockNetwork,
      };

      await loadThreadFromStorage(config);

      expect(mockState.results).toHaveLength(0);
    });

    /**
     * @test Should do nothing when history.get is not configured
     * @description Tests behavior when history config exists but lacks the get method
     */
    test("should do nothing when history.get is not configured", async () => {
      const config: ThreadOperationConfig<TestState> = {
        state: mockState,
        history: { appendResults: vi.fn() }, // No get method
        input: "test input",
        network: mockNetwork,
      };

      await loadThreadFromStorage(config);

      expect(mockState.results).toHaveLength(0);
    });

    /**
     * @test Should do nothing when no threadId exists
     * @description Verifies that history loading requires a valid threadId
     */
    test("should do nothing when no threadId exists", async () => {
      const config: ThreadOperationConfig<TestState> = {
        state: mockState,
        history: mockHistoryConfig,
        input: "test input",
        network: mockNetwork,
      };

      await loadThreadFromStorage(config);

      expect(mockHistoryConfig.get).not.toHaveBeenCalled();
      expect(mockState.results).toHaveLength(0);
    });

    /**
     * @test Should do nothing when state already has results
     * @description Prevents overwriting existing conversation state to avoid data loss
     */
    test("should do nothing when state already has results", async () => {
      mockState.threadId = "test-thread";
      const existingResult = new AgentResult("test", [], [], new Date());
      mockState.setResults([existingResult]);

      const config: ThreadOperationConfig<TestState> = {
        state: mockState,
        history: mockHistoryConfig,
        input: "test input",
        network: mockNetwork,
      };

      await loadThreadFromStorage(config);

      expect(mockHistoryConfig.get).not.toHaveBeenCalled();
      expect(mockState.results).toHaveLength(1);
    });

    /**
     * @test Should load history when conditions are met
     * @description Tests the main path for loading historical conversation data
     * @example
     * ```typescript
     * const historicalResults = [
     *   new AgentResult("agent1", [], [], new Date()),
     *   new AgentResult("agent2", [], [], new Date()),
     * ];
     * history.get = async ({ threadId }) => historicalResults;
     * ```
     */
    test("should load history when conditions are met", async () => {
      const threadId = "test-thread-789";
      mockState.threadId = threadId;

      const historicalResults = [
        new AgentResult("agent1", [], [], new Date()),
        new AgentResult("agent2", [], [], new Date()),
      ];
      mockHistoryConfig.get = vi.fn().mockResolvedValue(historicalResults);

      const config: ThreadOperationConfig<TestState> = {
        state: mockState,
        history: mockHistoryConfig,
        input: "test input",
        network: mockNetwork,
      };

      await loadThreadFromStorage(config);

      expect(mockHistoryConfig.get).toHaveBeenCalledWith({
        state: mockState,
        network: mockNetwork,
        input: "test input",
        step: expect.any(Object),
        threadId: threadId,
      });
      expect(mockState.results).toEqual(historicalResults);
    });

    /**
     * @test Should handle empty historical results
     * @description Verifies proper handling when storage returns no previous messages
     */
    test("should handle empty historical results", async () => {
      mockState.threadId = "test-thread";
      mockHistoryConfig.get = vi.fn().mockResolvedValue([]);

      const config: ThreadOperationConfig<TestState> = {
        state: mockState,
        history: mockHistoryConfig,
        input: "test input",
        network: mockNetwork,
      };

      await loadThreadFromStorage(config);

      expect(mockHistoryConfig.get).toHaveBeenCalled();
      expect(mockState.results).toHaveLength(0);
    });
  });

  /**
   * Test suite for the saveThreadToStorage function.
   * 
   * @description
   * Tests result persistence including:
   * - Saving only new results (not historical ones)
   * - Handling various configuration states
   * - Managing result counting and slicing
   * 
   * @test {saveThreadToStorage}
   */
  describe("saveThreadToStorage", () => {
    /**
     * @test Should do nothing when no history config is provided
     * @description Ensures graceful handling when no persistence is configured
     */
    test("should do nothing when no history config is provided", async () => {
      const config: SaveThreadToStorageConfig<TestState> = {
        state: mockState,
        input: "test input",
        initialResultCount: 0,
        network: mockNetwork,
      };

      await saveThreadToStorage(config);

      // No assertions needed - just ensuring no errors
    });

    /**
     * @test Should do nothing when appendResults is not configured
     * @description Tests behavior when history config lacks the appendResults method
     */
    test("should do nothing when appendResults is not configured", async () => {
      const config: SaveThreadToStorageConfig<TestState> = {
        state: mockState,
        history: { get: vi.fn() }, // No appendResults method
        input: "test input",
        initialResultCount: 0,
        network: mockNetwork,
      };

      await saveThreadToStorage(config);

      // No assertions needed - just ensuring no errors
    });

    /**
     * @test Should save only new results
     * @description Tests the core functionality of saving only newly generated results
     * @example
     * ```typescript
     * // Historical results (loaded from storage)
     * state.setResults([result1, result2]);
     * // New results (generated this run)  
     * state.appendResult(newResult1);
     * state.appendResult(newResult2);
     * // Only newResult1 and newResult2 should be saved
     * ```
     */
    test("should save only new results", async () => {
      // Set up initial state with some historical results
      const historicalResults = [
        new AgentResult("agent1", [], [], new Date()),
        new AgentResult("agent2", [], [], new Date()),
      ];
      mockState.setResults(historicalResults);

      // Add new results
      const newResult1 = new AgentResult("agent3", [], [], new Date());
      const newResult2 = new AgentResult("agent4", [], [], new Date());
      mockState.appendResult(newResult1);
      mockState.appendResult(newResult2);

      const config: SaveThreadToStorageConfig<TestState> = {
        state: mockState,
        history: mockHistoryConfig,
        input: "test input",
        initialResultCount: 2, // Only results after index 2 are new
        network: mockNetwork,
      };

      await saveThreadToStorage(config);

      expect(mockHistoryConfig.appendResults).toHaveBeenCalledWith({
        state: mockState,
        network: mockNetwork,
        step: expect.any(Object),
        newResults: [newResult1, newResult2],
        input: "test input",
      });
    });

    /**
     * @test Should handle no new results
     * @description Verifies proper handling when no new results were generated during the run
     */
    test("should handle no new results", async () => {
      const existingResults = [
        new AgentResult("agent1", [], [], new Date()),
      ];
      mockState.setResults(existingResults);

      const config: SaveThreadToStorageConfig<TestState> = {
        state: mockState,
        history: mockHistoryConfig,
        input: "test input",
        initialResultCount: 1, // No new results
        network: mockNetwork,
      };

      await saveThreadToStorage(config);

      expect(mockHistoryConfig.appendResults).toHaveBeenCalledWith({
        state: mockState,
        network: mockNetwork,
        step: expect.any(Object),
        newResults: [],
        input: "test input",
      });
    });

    /**
     * @test Should save all results when initialResultCount is 0
     * @description Tests scenario where all results in state are considered new (e.g., new conversation)
     */
    test("should save all results when initialResultCount is 0", async () => {
      const allResults = [
        new AgentResult("agent1", [], [], new Date()),
        new AgentResult("agent2", [], [], new Date()),
      ];
      mockState.setResults(allResults);

      const config: SaveThreadToStorageConfig<TestState> = {
        state: mockState,
        history: mockHistoryConfig,
        input: "test input",
        initialResultCount: 0,
        network: mockNetwork,
      };

      await saveThreadToStorage(config);

      expect(mockHistoryConfig.appendResults).toHaveBeenCalledWith({
        state: mockState,
        network: mockNetwork,
        step: expect.any(Object),
        newResults: allResults,
        input: "test input",
      });
    });
  });

  /**
   * Integration test scenarios.
   * 
   * @description
   * Tests complete conversation flows that exercise multiple history functions
   * together, simulating real-world usage patterns.
   * 
   * @test {Integration}
   */
  describe("Integration scenarios", () => {
    /**
     * @test Should handle complete conversation flow
     * @description Tests a full new conversation lifecycle from thread creation to result persistence
     * @example
     * ```typescript
     * // 1. Initialize thread (create new)
     * // 2. Load history (empty for new thread)  
     * // 3. Add conversation results
     * // 4. Save new results to storage
     * ```
     */
    test("should handle complete conversation flow", async () => {
      // 1. Initialize thread
      const threadId = "integration-thread";
      mockHistoryConfig.createThread = vi.fn().mockResolvedValue({ threadId });

      const initConfig: ThreadOperationConfig<TestState> = {
        state: mockState,
        history: mockHistoryConfig,
        input: "Hello",
        network: mockNetwork,
      };

      await initializeThread(initConfig);
      expect(mockState.threadId).toBe(threadId);

      // 2. Load existing history (empty for new thread)
      mockHistoryConfig.get = vi.fn().mockResolvedValue([]);
      
      const loadConfig: ThreadOperationConfig<TestState> = {
        state: mockState,
        history: mockHistoryConfig,
        input: "Hello",
        network: mockNetwork,
      };

      await loadThreadFromStorage(loadConfig);
      expect(mockState.results).toHaveLength(0);

      // 3. Simulate agent conversation
      const newResult = new AgentResult("assistant", [], [], new Date());
      mockState.appendResult(newResult);

      // 4. Save new results
      const saveConfig: SaveThreadToStorageConfig<TestState> = {
        state: mockState,
        history: mockHistoryConfig,
        input: "Hello",
        initialResultCount: 0,
        network: mockNetwork,
      };

      await saveThreadToStorage(saveConfig);

      expect(mockHistoryConfig.appendResults).toHaveBeenCalledWith({
        state: mockState,
        network: mockNetwork,
        step: expect.any(Object),
        newResults: [newResult],
        input: "Hello",
      });
    });

    /**
     * @test Should handle resuming existing conversation
     * @description Tests continuing a conversation with existing history
     * @example
     * ```typescript
     * // Load existing conversation with 2 previous messages
     * // Add 1 new message  
     * // Save only the new message (not the 2 existing ones)
     * ```
     */
    test("should handle resuming existing conversation", async () => {
      const existingThreadId = "existing-thread";
      mockState.threadId = existingThreadId;

      // Load existing history
      const historicalResults = [
        new AgentResult("user", [{ type: "text", role: "user", content: "Hello" }], [], new Date()),
        new AgentResult("assistant", [{ type: "text", role: "assistant", content: "Hi there!" }], [], new Date()),
      ];
      mockHistoryConfig.get = vi.fn().mockResolvedValue(historicalResults);

      const loadConfig: ThreadOperationConfig<TestState> = {
        state: mockState,
        history: mockHistoryConfig,
        input: "How are you?",
        network: mockNetwork,
      };

      await loadThreadFromStorage(loadConfig);
      expect(mockState.results).toEqual(historicalResults);

      // Add new conversation turn
      const newResult = new AgentResult("assistant", [{ type: "text", role: "assistant", content: "I'm doing well!" }], [], new Date());
      mockState.appendResult(newResult);

      // Save only the new result
      const saveConfig: SaveThreadToStorageConfig<TestState> = {
        state: mockState,
        history: mockHistoryConfig,
        input: "How are you?",
        initialResultCount: 2, // 2 historical results
        network: mockNetwork,
      };

      await saveThreadToStorage(saveConfig);

      expect(mockHistoryConfig.appendResults).toHaveBeenCalledWith({
        state: mockState,
        network: mockNetwork,
        step: expect.any(Object),
        newResults: [newResult],
        input: "How are you?",
      });
    });
  });

  /**
   * Error handling test scenarios.
   * 
   * @description
   * Tests how the history functions handle various error conditions
   * and ensure proper error propagation.
   * 
   * @test {ErrorHandling}
   */
  describe("Error handling", () => {
    /**
     * @test Should handle createThread errors gracefully
     * @description Verifies that database errors during thread creation are properly propagated
     */
    test("should handle createThread errors gracefully", async () => {
      mockHistoryConfig.createThread = vi.fn().mockRejectedValue(new Error("Database error"));

      const config: ThreadOperationConfig<TestState> = {
        state: mockState,
        history: mockHistoryConfig,
        input: "test input",
        network: mockNetwork,
      };

      await expect(initializeThread(config)).rejects.toThrow("Database error");
    });

    /**
     * @test Should handle history.get errors gracefully  
     * @description Ensures storage errors during history loading are properly handled
     */
    test("should handle history.get errors gracefully", async () => {
      mockState.threadId = "test-thread";
      mockHistoryConfig.get = vi.fn().mockRejectedValue(new Error("Storage error"));

      const config: ThreadOperationConfig<TestState> = {
        state: mockState,
        history: mockHistoryConfig,
        input: "test input",
        network: mockNetwork,
      };

      await expect(loadThreadFromStorage(config)).rejects.toThrow("Storage error");
    });

    /**
     * @test Should handle appendResults errors gracefully
     * @description Verifies that save errors during result persistence are properly propagated
     */
    test("should handle appendResults errors gracefully", async () => {
      mockState.appendResult(new AgentResult("test", [], [], new Date()));
      mockHistoryConfig.appendResults = vi.fn().mockRejectedValue(new Error("Save error"));

      const config: SaveThreadToStorageConfig<TestState> = {
        state: mockState,
        history: mockHistoryConfig,
        input: "test input",
        initialResultCount: 0,
        network: mockNetwork,
      };

      await expect(saveThreadToStorage(config)).rejects.toThrow("Save error");
    });
  });

  /**
   * Edge case test scenarios.
   * 
   * @description
   * Tests unusual but valid scenarios to ensure robust behavior
   * under various conditions.
   * 
   * @test {EdgeCases}
   */
  describe("Edge cases", () => {
    /**
     * @test Should handle undefined network parameter
     * @description Tests behavior when running in standalone agent context (no network)
     */
    test("should handle undefined network parameter", async () => {
      const config: ThreadOperationConfig<TestState> = {
        state: mockState,
        history: mockHistoryConfig,
        input: "test input",
        // network: undefined
      };

      mockHistoryConfig.createThread = vi.fn().mockResolvedValue({ threadId: "test" });

      await initializeThread(config);

      expect(mockHistoryConfig.createThread).toHaveBeenCalledWith({
        state: mockState,
        network: undefined,
        input: "test input",
        step: expect.any(Object),
      });
    });

    /**
     * @test Should handle empty input string
     * @description Verifies proper handling of edge case where user input is empty
     */
    test("should handle empty input string", async () => {
      mockState.threadId = "test-thread";
      mockHistoryConfig.get = vi.fn().mockResolvedValue([]);

      const config: ThreadOperationConfig<TestState> = {
        state: mockState,
        history: mockHistoryConfig,
        input: "",
        network: mockNetwork,
      };

      await loadThreadFromStorage(config);

      expect(mockHistoryConfig.get).toHaveBeenCalledWith({
        state: mockState,
        network: mockNetwork,
        input: "",
        step: expect.any(Object),
        threadId: "test-thread",
      });
    });

    /**
     * @test Should handle very large result arrays
     * @description Tests performance and functionality with large conversation histories
     * @example
     * ```typescript
     * // Create 1000 historical results
     * // Add 500 new results  
     * // Verify only the 500 new ones are saved
     * ```
     */
    test("should handle very large result arrays", async () => {
      // Create a large number of results
      const largeResultArray = Array.from({ length: 1000 }, (_, i) => 
        new AgentResult(`agent-${i}`, [], [], new Date())
      );
      
      mockState.setResults(largeResultArray);

      const config: SaveThreadToStorageConfig<TestState> = {
        state: mockState,
        history: mockHistoryConfig,
        input: "test input",
        initialResultCount: 500, // Save last 500 results
        network: mockNetwork,
      };

      await saveThreadToStorage(config);

      expect(mockHistoryConfig.appendResults).toHaveBeenCalledWith({
        state: mockState,
        network: mockNetwork,
        step: expect.any(Object),
        newResults: largeResultArray.slice(500),
        input: "test input",
      });
    });
  });
}); 