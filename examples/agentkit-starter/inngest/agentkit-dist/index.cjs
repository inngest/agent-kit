"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  Agent: () => Agent,
  AgentResult: () => AgentResult,
  AgenticModel: () => AgenticModel,
  Network: () => Network,
  NetworkRun: () => NetworkRun,
  RoutingAgent: () => RoutingAgent,
  State: () => State,
  anthropic: () => import_ai8.anthropic,
  createAgent: () => createAgent,
  createAgenticModelFromAiAdapter: () => createAgenticModelFromAiAdapter,
  createNetwork: () => createNetwork,
  createRoutingAgent: () => createRoutingAgent,
  createState: () => createState,
  createTool: () => createTool,
  gemini: () => import_ai8.gemini,
  getDefaultRoutingAgent: () => getDefaultRoutingAgent,
  getInngestFnInput: () => getInngestFnInput,
  getStepTools: () => getStepTools,
  grok: () => import_ai8.grok,
  initializeThread: () => initializeThread,
  isInngestFn: () => isInngestFn,
  loadThreadFromStorage: () => loadThreadFromStorage,
  openai: () => import_ai8.openai,
  saveThreadToStorage: () => saveThreadToStorage,
  stringifyError: () => stringifyError
});
module.exports = __toCommonJS(index_exports);

// src/agent.ts
var import_json_schema_to_zod = require("@dmitryrechkin/json-schema-to-zod");
var import_ai7 = require("@inngest/ai");
var import_client = require("@modelcontextprotocol/sdk/client/index.js");
var import_streamableHttp = require("@modelcontextprotocol/sdk/client/streamableHttp.js");
var import_sse = require("@modelcontextprotocol/sdk/client/sse.js");
var import_websocket = require("@modelcontextprotocol/sdk/client/websocket.js");
var import_transport = require("@modelcontextprotocol/sdk/shared/transport.js");
var import_types6 = require("@modelcontextprotocol/sdk/types.js");
var import_eventsource = require("eventsource");
var import_inngest4 = require("inngest");
var import_InngestFunction2 = require("inngest/components/InngestFunction");
var import_errors = require("inngest/helpers/errors");
var import_types7 = require("inngest/types");

// src/model.ts
var import_ai6 = require("@inngest/ai");

// src/adapters/index.ts
var import_ai5 = require("@inngest/ai");

// src/adapters/anthropic.ts
var import_ai2 = require("@inngest/ai");
var import_zod_to_json_schema = require("zod-to-json-schema");
var import_zod4 = require("zod");

// src/types.ts
var import_xxhashjs = __toESM(require("xxhashjs"), 1);
var _checksum;
var AgentResult = class {
  constructor(agentName, output, toolCalls, createdAt, prompt, history, raw) {
    this.agentName = agentName;
    this.output = output;
    this.toolCalls = toolCalls;
    this.createdAt = createdAt;
    this.prompt = prompt;
    this.history = history;
    this.raw = raw;
    // checksum memoizes a checksum so that it doe snot have to be calculated many times.
    __privateAdd(this, _checksum);
  }
  /**
   * export returns all fields necessary to store the AgentResult for future use.
   */
  export() {
    return {
      agentName: this.agentName,
      output: this.output,
      toolCalls: this.toolCalls,
      createdAt: this.createdAt,
      checksum: this.checksum
    };
  }
  /**
   * checksum is a unique ID for this result.
   *
   * It is generated by taking a checksum of the message output and the created at date.
   * This allows you to dedupe items when saving conversation history.
   */
  get checksum() {
    if (__privateGet(this, _checksum) === void 0) {
      const input = JSON.stringify(this.output.concat(this.toolCalls)) + this.createdAt.toString();
      __privateSet(this, _checksum, import_xxhashjs.default.h64(input, 0).toString());
    }
    return __privateGet(this, _checksum);
  }
};
_checksum = new WeakMap();

// src/tool.ts
var import_inngest3 = require("inngest");
var import_zod3 = require("zod");

// src/state.ts
var createState = (initialState, opts) => {
  return new State(__spreadProps(__spreadValues({}, opts), { data: initialState }));
};
var __kv;
var _State = class _State {
  constructor({ data, messages, results, threadId } = {}) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    __privateAdd(this, __kv);
    this._results = results || [];
    this._messages = messages || [];
    this._data = data ? __spreadValues({}, data) : {};
    this.threadId = threadId;
    this.data = new Proxy(this._data, {
      set: (target, prop, value) => {
        if (typeof prop === "string" && prop in target) {
          Reflect.set(target, prop, value);
          return true;
        }
        return Reflect.set(target, prop, value);
      }
    });
    __privateSet(this, __kv, new Map(Object.entries(this._data)));
    this.kv = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      set: (key, value) => {
        __privateGet(this, __kv).set(key, value);
      },
      get: (key) => {
        return __privateGet(this, __kv).get(key);
      },
      delete: (key) => {
        return __privateGet(this, __kv).delete(key);
      },
      has: (key) => {
        return __privateGet(this, __kv).has(key);
      },
      all: () => {
        return Object.fromEntries(__privateGet(this, __kv));
      }
    };
  }
  /**
   * Results returns a new array containing all past inference results in the
   * network. This array is safe to modify.
   */
  get results() {
    return this._results.slice();
  }
  /**
   * Replaces all results with the provided array
   * used when loading initial results from history.get()
   */
  setResults(results) {
    this._results = results;
  }
  /**
   * Returns a slice of results from the given start index
   * used when saving results to a database via history.appendResults()
   */
  getResultsFrom(startIndex) {
    return this._results.slice(startIndex);
  }
  /**
   * formatHistory returns the memory used for agentic calls based off of prior
   * agentic calls.
   *
   * This is used to format the current State as a conversation log when
   * calling an individual agent.
   *
   */
  formatHistory(formatter) {
    if (!formatter) {
      formatter = defaultResultFormatter;
    }
    return this._messages.concat(
      this._results.map((result) => formatter(result)).flat()
    );
  }
  /**
   * appendResult appends a given result to the current state.  This
   * is called by the network after each iteration.
   */
  appendResult(call) {
    this._results.push(call);
  }
  /**
   * clone allows you to safely clone the state.
   */
  clone() {
    const state = new _State({ data: this.data, threadId: this.threadId });
    state._results = this._results.slice();
    state._messages = this._messages.slice();
    return state;
  }
};
__kv = new WeakMap();
var State = _State;
var defaultResultFormatter = (r) => {
  return [].concat(r.output).concat(r.toolCalls);
};

// src/network.ts
var import_ai = require("@inngest/ai");
var import_zod2 = require("zod");

// src/util.ts
var import_inngest = require("inngest");
var import_InngestFunction = require("inngest/components/InngestFunction");
var import_experimental = require("inngest/experimental");
var import_zod = require("zod");
var stringifyError = (e) => {
  if (e instanceof Error) {
    return e.message;
  }
  return String(e);
};
var getStepTools = async () => {
  const asyncCtx = await (0, import_experimental.getAsyncCtx)();
  return asyncCtx == null ? void 0 : asyncCtx.ctx.step;
};
var isInngestFn = (fn) => {
  if (fn instanceof import_InngestFunction.InngestFunction) {
    return true;
  }
  if (typeof fn === "object" && fn !== null && "createExecution" in fn && typeof fn.createExecution === "function") {
    return true;
  }
  return false;
};
var getInngestFnInput = (fn) => {
  var _a, _b, _c;
  const runtimeSchemas = (_a = fn["client"]["schemas"]) == null ? void 0 : _a["runtimeSchemas"];
  if (!runtimeSchemas) {
    return;
  }
  const schemasToAttempt = new Set(
    (_c = (_b = fn["opts"].triggers) == null ? void 0 : _b.reduce((acc, trigger) => {
      if (trigger.event) {
        return [...acc, trigger.event];
      }
      return acc;
    }, [])) != null ? _c : []
  );
  if (!schemasToAttempt.size) {
    return;
  }
  let schema;
  for (const eventSchema of schemasToAttempt) {
    const runtimeSchema = runtimeSchemas[eventSchema];
    if (typeof runtimeSchema === "object" && runtimeSchema !== null && "data" in runtimeSchema && helpers.isZodObject(runtimeSchema.data)) {
      if (schema) {
        schema = schema.or(runtimeSchema.data);
      } else {
        schema = runtimeSchema.data;
      }
      continue;
    }
  }
  return schema;
};
var helpers = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  isZodObject: (value) => {
    return value instanceof import_zod.ZodType && value._def.typeName === "ZodObject";
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  isObject: (value) => {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
};

// src/history.ts
var import_inngest2 = require("inngest");
async function initializeThread(config) {
  const { state, history, input, network } = config;
  if (!history) return;
  const step = await getStepTools();
  if (!state.threadId && history.createThread) {
    const { threadId } = await history.createThread({
      state,
      network,
      input,
      step
    });
    state.threadId = threadId;
  } else if (!state.threadId && history.get) {
    state.threadId = crypto.randomUUID();
    if (history.createThread) {
      await history.createThread({
        state,
        network,
        input,
        step
      });
    }
  }
}
async function loadThreadFromStorage(config) {
  const { state, history, input, network } = config;
  if (!(history == null ? void 0 : history.get) || !state.threadId || state.results.length > 0) {
    return;
  }
  const step = await getStepTools();
  const historyResults = await history.get({
    state,
    network,
    input,
    step,
    threadId: state.threadId
  });
  state.setResults(historyResults);
}
async function saveThreadToStorage(config) {
  const { state, history, input, initialResultCount, network } = config;
  if (!(history == null ? void 0 : history.appendResults)) return;
  const step = await getStepTools();
  const newResults = state.getResultsFrom(initialResultCount);
  const userMessage = input.trim() ? {
    content: input,
    role: "user",
    timestamp: /* @__PURE__ */ new Date()
  } : void 0;
  await history.appendResults({
    state,
    network,
    step,
    newResults,
    input,
    threadId: state.threadId,
    userMessage
  });
}

// src/network.ts
var createNetwork = (opts) => new Network(opts);
var Network = class {
  constructor({
    name,
    description,
    agents,
    defaultModel,
    maxIter,
    defaultState,
    router,
    defaultRouter,
    history
  }) {
    this._counter = 0;
    this.name = name;
    this.description = description;
    this.agents = /* @__PURE__ */ new Map();
    this._agents = /* @__PURE__ */ new Map();
    this.defaultModel = defaultModel;
    this.router = defaultRouter != null ? defaultRouter : router;
    this.maxIter = maxIter || 0;
    this._stack = [];
    this.history = history;
    if (defaultState) {
      this.state = defaultState;
    } else {
      this.state = createState();
    }
    for (const agent of agents) {
      this.agents.set(agent.name, agent);
      this._agents.set(agent.name, agent);
    }
  }
  async availableAgents(networkRun = new NetworkRun(this, new State())) {
    var _a;
    const available = [];
    const all = Array.from(this.agents.values());
    for (const a of all) {
      const enabled = (_a = a == null ? void 0 : a.lifecycles) == null ? void 0 : _a.enabled;
      if (!enabled || await enabled({ agent: a, network: networkRun })) {
        available.push(a);
      }
    }
    return available;
  }
  /**
   * addAgent adds a new agent to the network.
   */
  addAgent(agent) {
    this.agents.set(agent.name, agent);
  }
  /**
   * run handles a given request using the network of agents.  It is not
   * concurrency-safe; you can only call run on a network once, as networks are
   * stateful.
   *
   */
  run(...[input, overrides]) {
    var _a;
    let state;
    if (overrides == null ? void 0 : overrides.state) {
      if (overrides.state instanceof State) {
        state = overrides.state;
      } else {
        state = new State(overrides.state);
      }
    } else {
      state = ((_a = this.state) == null ? void 0 : _a.clone()) || new State();
    }
    return new NetworkRun(this, state)["execute"](input, overrides);
  }
};
var defaultRoutingAgent;
var getDefaultRoutingAgent = () => {
  defaultRoutingAgent != null ? defaultRoutingAgent : defaultRoutingAgent = createRoutingAgent({
    name: "Default routing agent",
    description: "Selects which agents to work on based off of the current prompt and input.",
    lifecycle: {
      onRoute: ({ result }) => {
        const tool = result.toolCalls[0];
        if (!tool) {
          return;
        }
        if (typeof tool.content === "object" && tool.content !== null && "data" in tool.content && typeof tool.content.data === "string") {
          return [tool.content.data];
        }
        return;
      }
    },
    tools: [
      // This tool does nothing but ensure that the model responds with the
      // agent name as valid JSON.
      createTool({
        name: "select_agent",
        description: "select an agent to handle the input, based off of the current conversation",
        parameters: import_zod2.z.object({
          name: import_zod2.z.string().describe("The name of the agent that should handle the request")
        }).strict(),
        handler: ({ name }, { network }) => {
          if (typeof name !== "string") {
            throw new Error("The routing agent requested an invalid agent");
          }
          const agent = network.agents.get(name);
          if (agent === void 0) {
            throw new Error(
              `The routing agent requested an agent that doesn't exist: ${name}`
            );
          }
          return agent.name;
        }
      })
    ],
    tool_choice: "select_agent",
    system: async ({ network }) => {
      if (!network) {
        throw new Error(
          "The routing agent can only be used within a network of agents"
        );
      }
      const agents = await (network == null ? void 0 : network.availableAgents());
      return `You are the orchestrator between a group of agents.  Each agent is suited for a set of specific tasks, and has a name, instructions, and a set of tools.

The following agents are available:
<agents>
  ${agents.map((a) => {
        return `
    <agent>
      <name>${a.name}</name>
      <description>${a.description}</description>
      <tools>${JSON.stringify(Array.from(a.tools.values()))}</tools>
    </agent>`;
      }).join("\n")}
</agents>

Follow the set of instructions:

<instructions>
  Think about the current history and status.  Determine which agent to use to handle the user's request, based off of the current agents and their tools.

  Your aim is to thoroughly complete the request, thinking step by step, choosing the right agent based off of the context.
</instructions>
    `;
    }
  });
  return defaultRoutingAgent;
};
var NetworkRun = class extends Network {
  constructor(network, state) {
    super({
      name: network.name,
      description: network.description,
      agents: Array.from(network.agents.values()),
      defaultModel: network.defaultModel,
      defaultState: network.state,
      router: network.router,
      maxIter: network.maxIter,
      history: network.history
    });
    this.state = state;
  }
  run() {
    throw new Error("NetworkRun does not support run");
  }
  async availableAgents() {
    return super.availableAgents(this);
  }
  /**
   * Schedule is used to push an agent's run function onto the stack.
   */
  schedule(agentName) {
    this["_stack"].push(agentName);
  }
  async execute(...[input, overrides]) {
    await initializeThread({
      state: this.state,
      history: this.history,
      input,
      network: this
    });
    await loadThreadFromStorage({
      state: this.state,
      history: this.history,
      input,
      network: this
    });
    const available = await this.availableAgents();
    if (available.length === 0) {
      throw new Error("no agents enabled in network");
    }
    const initialResultCount = this.state.results.length;
    const next = await this.getNextAgents(
      input,
      (overrides == null ? void 0 : overrides.router) || (overrides == null ? void 0 : overrides.defaultRouter) || this.router
    );
    if (!(next == null ? void 0 : next.length)) {
      return this;
    }
    for (const agent of next) {
      this.schedule(agent.name);
    }
    while (this._stack.length > 0 && (this.maxIter === 0 || this._counter < this.maxIter)) {
      const agentName = this._stack.shift();
      const agent = agentName && this._agents.get(agentName);
      if (!agent) {
        return this;
      }
      const call = await agent.run(input, { network: this, maxIter: 0 });
      this._counter += 1;
      this.state.appendResult(call);
      const next2 = await this.getNextAgents(
        input,
        (overrides == null ? void 0 : overrides.router) || (overrides == null ? void 0 : overrides.defaultRouter) || this.router
      );
      for (const a of next2 || []) {
        this.schedule(a.name);
      }
    }
    await saveThreadToStorage({
      state: this.state,
      history: this.history,
      input,
      initialResultCount,
      network: this
    });
    return this;
  }
  async getNextAgents(input, router) {
    if (!router && !this.defaultModel) {
      throw new Error(
        "No router or model defined in network.  You must pass a router or a default model to use the built-in agentic router."
      );
    }
    if (!router) {
      router = getDefaultRoutingAgent();
    }
    if (router instanceof RoutingAgent) {
      return await this.getNextAgentsViaRoutingAgent(router, input);
    }
    const stack = this._stack.map((name) => {
      const agent2 = this._agents.get(name);
      if (!agent2) {
        throw new Error(`unknown agent in the network stack: ${name}`);
      }
      return agent2;
    });
    const agent = await router({
      input,
      network: this,
      stack,
      lastResult: this.state.results.pop(),
      callCount: this._counter
    });
    if (!agent) {
      return;
    }
    if (agent instanceof RoutingAgent) {
      return await this.getNextAgentsViaRoutingAgent(agent, input);
    }
    for (const a of Array.isArray(agent) ? agent : [agent]) {
      if (!this._agents.has(a.name)) {
        this._agents.set(a.name, a);
      }
    }
    return Array.isArray(agent) ? agent : [agent];
  }
  async getNextAgentsViaRoutingAgent(routingAgent, input) {
    const result = await routingAgent.run(input, {
      network: this,
      model: routingAgent.model || this.defaultModel
    });
    const agentNames = routingAgent.lifecycles.onRoute({
      result,
      agent: routingAgent,
      network: this
    });
    return (agentNames || []).map((name) => this.agents.get(name)).filter(Boolean);
  }
};

// src/tool.ts
function createTool({
  name,
  description,
  parameters,
  handler
}) {
  return {
    name,
    description,
    parameters,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler
    // eslint-disable-line @typescript-eslint/no-explicit-any
  };
}

// src/adapters/anthropic.ts
var requestParser = (model, messages, tools, tool_choice = "auto") => {
  const systemMessage = messages.find(
    (m) => m.role === "system" && m.type === "text"
  );
  const system = typeof (systemMessage == null ? void 0 : systemMessage.content) === "string" ? systemMessage.content : "";
  const anthropicMessages = messages.filter((m) => m.role !== "system").reduce(
    (acc, m) => {
      switch (m.type) {
        case "text":
          return [
            ...acc,
            {
              role: m.role,
              content: Array.isArray(m.content) ? m.content.map((text) => ({ type: "text", text })) : m.content
            }
          ];
        case "tool_call":
          return [
            ...acc,
            {
              role: m.role,
              content: m.tools.map((tool) => ({
                type: "tool_use",
                id: tool.id,
                input: tool.input,
                name: tool.name
              }))
            }
          ];
        case "tool_result":
          return [
            ...acc,
            {
              role: "user",
              content: [
                {
                  type: "tool_result",
                  tool_use_id: m.tool.id,
                  content: typeof m.content === "string" ? m.content : JSON.stringify(m.content)
                }
              ]
            }
          ];
      }
    },
    []
  );
  const lastMessage = anthropicMessages[anthropicMessages.length - 1];
  if ((lastMessage == null ? void 0 : lastMessage.role) === "assistant") {
    lastMessage.role = "user";
  }
  const request = {
    system,
    model: model.options.model,
    max_tokens: model.options.defaultParameters.max_tokens,
    messages: anthropicMessages
  };
  if (tools == null ? void 0 : tools.length) {
    request.tools = tools.map((t) => {
      return {
        name: t.name,
        description: t.description,
        input_schema: t.parameters ? (0, import_zod_to_json_schema.zodToJsonSchema)(t.parameters) : (0, import_zod_to_json_schema.zodToJsonSchema)(
          import_zod4.z.object({})
        )
      };
    });
    request.tool_choice = toolChoice(tool_choice);
  }
  return request;
};
var responseParser = (input) => {
  var _a, _b;
  if (input.type === "error") {
    throw new Error(
      ((_a = input.error) == null ? void 0 : _a.message) || `Anthropic request failed: ${JSON.stringify(input.error)}`
    );
  }
  return ((_b = input == null ? void 0 : input.content) != null ? _b : []).reduce((acc, item) => {
    if (!item.type) {
      return acc;
    }
    switch (item.type) {
      case "text":
        return [
          ...acc,
          {
            type: "text",
            role: input.role,
            content: item.text,
            // XXX: Better stop reason parsing
            stop_reason: "stop"
          }
        ];
      case "tool_use": {
        let args;
        try {
          args = typeof item.input === "string" ? JSON.parse(item.input) : item.input;
        } catch (e) {
          args = item.input;
        }
        return [
          ...acc,
          {
            type: "tool_call",
            role: input.role,
            stop_reason: "tool",
            tools: [
              {
                type: "tool",
                id: item.id,
                name: item.name,
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                input: args
              }
            ]
          }
        ];
      }
    }
  }, []);
};
var toolChoice = (choice) => {
  switch (choice) {
    case "auto":
      return { type: "auto" };
    case "any":
      return { type: "any" };
    default:
      if (typeof choice === "string") {
        return {
          type: "tool",
          name: choice
        };
      }
  }
};

// src/adapters/openai.ts
var import_ai3 = require("@inngest/ai");
var import_zod_to_json_schema2 = require("zod-to-json-schema");
var requestParser2 = (model, messages, tools, tool_choice = "auto") => {
  var _a, _b;
  const request = {
    messages: messages.map((m) => {
      var _a2;
      switch (m.type) {
        case "text":
          return {
            role: m.role,
            content: m.content
          };
        case "tool_call":
          return {
            role: "assistant",
            content: null,
            tool_calls: m.tools ? (_a2 = m.tools) == null ? void 0 : _a2.map((tool) => ({
              id: tool.id,
              type: "function",
              function: {
                name: tool.name,
                arguments: JSON.stringify(tool.input)
              }
            })) : void 0
          };
        case "tool_result":
          return {
            role: "tool",
            tool_call_id: m.tool.id,
            content: typeof m.content === "string" ? m.content : JSON.stringify(m.content)
          };
      }
    })
  };
  if (tools == null ? void 0 : tools.length) {
    request.tool_choice = toolChoice2(tool_choice);
    if (!((_a = model.options.model) == null ? void 0 : _a.includes("o3")) && !((_b = model.options.model) == null ? void 0 : _b.includes("o1"))) {
      request.parallel_tool_calls = false;
    }
    request.tools = tools.map((t) => {
      return {
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters && (0, import_zod_to_json_schema2.zodToJsonSchema)(t.parameters, { target: "openAi" }),
          strict: typeof t.strict !== "undefined" ? t.strict : Boolean(t.parameters)
          // strict mode is only supported with parameters
        }
      };
    });
  }
  return request;
};
var responseParser2 = (input) => {
  var _a;
  if (input.error) {
    throw new Error(
      input.error.message || `OpenAI request failed: ${JSON.stringify(input.error)}`
    );
  }
  return ((_a = input == null ? void 0 : input.choices) != null ? _a : []).reduce((acc, choice) => {
    var _a2, _b;
    const { message, finish_reason } = choice;
    if (!message) {
      return acc;
    }
    const base = {
      role: choice.message.role,
      stop_reason: openAiStopReasonToStateStopReason[finish_reason != null ? finish_reason : ""] || "stop"
    };
    if (message.content && message.content.trim() !== "") {
      return [
        ...acc,
        __spreadProps(__spreadValues({}, base), {
          type: "text",
          content: message.content
        })
      ];
    }
    if (((_b = (_a2 = message.tool_calls) == null ? void 0 : _a2.length) != null ? _b : 0) > 0) {
      return [
        ...acc,
        __spreadProps(__spreadValues({}, base), {
          type: "tool_call",
          tools: message.tool_calls.map((tool) => {
            return {
              type: "tool",
              id: tool.id,
              name: tool.function.name,
              function: tool.function.name,
              input: safeParseOpenAIJson(tool.function.arguments || "{}")
            };
          })
        })
      ];
    }
    return acc;
  }, []);
};
var safeParseOpenAIJson = (str) => {
  const trimmed = str.replace(/^["']|["']$/g, "");
  try {
    return JSON.parse(trimmed);
  } catch (e) {
    try {
      const withQuotes = trimmed.replace(
        /`([\s\S]*?)`/g,
        (_, content) => JSON.stringify(content)
      );
      return JSON.parse(withQuotes);
    } catch (e2) {
      throw new Error(
        `Failed to parse JSON with backticks: ${stringifyError(e2)}`
      );
    }
  }
};
var openAiStopReasonToStateStopReason = {
  tool_calls: "tool",
  stop: "stop",
  length: "stop",
  content_filter: "stop",
  function_call: "tool"
};
var toolChoice2 = (choice) => {
  switch (choice) {
    case "auto":
      return "auto";
    case "any":
      return "required";
    default:
      return {
        type: "function",
        function: { name: choice }
      };
  }
};

// src/adapters/gemini.ts
var import_ai4 = require("@inngest/ai");
var import_zod5 = require("zod");
var import_zod_to_json_schema3 = require("zod-to-json-schema");
var requestParser3 = (_model2, messages, tools, tool_choice = "auto") => {
  const contents = messages.map((m) => messageToContent(m));
  const functionDeclarations = tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters ? geminiZodToJsonSchema(t.parameters) : (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      geminiZodToJsonSchema(import_zod5.z.object({}))
    )
  }));
  return __spreadValues({
    contents
  }, tools.length > 0 ? {
    tools: [
      {
        functionDeclarations
      }
    ],
    tool_config: toolChoice3(tool_choice)
  } : {});
};
var messageContentToString = (content) => {
  if (typeof content === "string") {
    return content;
  }
  return content.map((c) => c.text).join("");
};
var responseParser3 = (input) => {
  var _a, _b;
  if (input.error) {
    throw new Error(
      ((_a = input.error) == null ? void 0 : _a.message) || `Gemini request failed: ${JSON.stringify(input.error)}`
    );
  }
  const messages = [];
  for (const candidate of (_b = input.candidates) != null ? _b : []) {
    for (const content of candidate.content.parts) {
      if (candidate.content.role === "user" && "text" in content) {
        messages.push({
          role: "user",
          type: "text",
          content: content.text
        });
      } else if (candidate.content.role === "model" && "text" in content) {
        messages.push({
          role: "assistant",
          type: "text",
          content: content.text
        });
      } else if (candidate.content.role === "model" && "functionCall" in content) {
        messages.push({
          role: "assistant",
          type: "tool_call",
          stop_reason: "tool",
          tools: [
            {
              name: content.functionCall.name,
              input: content.functionCall.args,
              type: "tool",
              id: content.functionCall.name
            }
          ]
        });
      } else if (candidate.content.role === "user" && "functionResponse" in content) {
        messages.push({
          role: "tool_result",
          type: "tool_result",
          stop_reason: "tool",
          tool: {
            name: content.functionResponse.name,
            input: content.functionResponse.response,
            type: "tool",
            id: content.functionResponse.name
          },
          content: JSON.stringify(content.functionResponse.response)
        });
      } else {
        throw new Error("Unknown content type");
      }
    }
  }
  return messages;
};
var messageToContent = (m) => {
  switch (m.role) {
    case "system":
      return {
        role: "user",
        parts: [{ text: messageContentToString(m.content) }]
      };
    case "user":
      switch (m.type) {
        case "tool_call":
          if (m.tools.length === 0) {
            throw new Error("Tool call message must have at least one tool");
          }
          return {
            role: "model",
            parts: [
              {
                functionCall: {
                  name: m.tools[0].name,
                  args: m.tools[0].input
                }
              }
            ]
          };
        case "text":
        default:
          return {
            role: "user",
            parts: [{ text: messageContentToString(m.content) }]
          };
      }
    case "assistant":
      switch (m.type) {
        case "tool_call":
          if (m.tools.length === 0) {
            throw new Error("Tool call message must have at least one tool");
          }
          return {
            role: "model",
            parts: [
              {
                functionCall: {
                  name: m.tools[0].name,
                  args: m.tools[0].input
                }
              }
            ]
          };
        case "text":
        default:
          return {
            role: "model",
            parts: [{ text: messageContentToString(m.content) }]
          };
      }
    case "tool_result":
      return {
        role: "user",
        parts: [
          {
            functionResponse: {
              name: m.tool.name,
              response: {
                name: m.tool.name,
                content: typeof m.content === "string" ? m.content : JSON.stringify(m.content)
              }
            }
          }
        ]
      };
    default:
      throw new Error(`Unknown message role: ${m.role}`);
  }
};
var toolChoice3 = (choice) => {
  switch (choice) {
    case "auto":
      return {
        functionCallingConfig: {
          mode: "AUTO"
        }
      };
    case "any":
      return {
        functionCallingConfig: {
          mode: "ANY"
        }
      };
    default:
      if (typeof choice === "string") {
        return {
          functionCallingConfig: {
            mode: "ANY",
            allowedFunctionNames: [choice]
          }
        };
      }
  }
};
var geminiZodToJsonSchema = (zod) => {
  const schema = (0, import_zod_to_json_schema3.zodToJsonSchema)(zod, { target: "openApi3" });
  delete schema["additionalProperties"];
  return schema;
};

// src/adapters/grok.ts
var requestParser4 = (model, messages, tools, tool_choice = "auto") => {
  const request = requestParser2(
    model,
    messages,
    tools,
    tool_choice
  );
  request.tools = (request.tools || []).map((tool) => __spreadProps(__spreadValues({}, tool), {
    function: __spreadProps(__spreadValues({}, tool.function), {
      strict: false
    })
  }));
  return request;
};
var responseParser4 = responseParser2;

// src/adapters/index.ts
var adapters = {
  "openai-chat": {
    request: requestParser2,
    response: responseParser2
  },
  anthropic: {
    request: requestParser,
    response: responseParser
  },
  gemini: {
    request: requestParser3,
    response: responseParser3
  },
  grok: {
    request: requestParser4,
    response: responseParser4
  }
};

// src/model.ts
var createAgenticModelFromAiAdapter = (adapter) => {
  const opts = adapters[adapter.format];
  return new AgenticModel({
    model: adapter,
    requestParser: opts.request,
    responseParser: opts.response
  });
};
var _model;
var AgenticModel = class {
  constructor({
    model,
    requestParser: requestParser5,
    responseParser: responseParser5
  }) {
    __privateAdd(this, _model);
    __privateSet(this, _model, model);
    this.requestParser = requestParser5;
    this.responseParser = responseParser5;
  }
  async infer(stepID, input, tools, tool_choice) {
    var _a, _b;
    const body = this.requestParser(__privateGet(this, _model), input, tools, tool_choice);
    let result;
    const step = await getStepTools();
    if (step) {
      result = await step.ai.infer(stepID, {
        model: __privateGet(this, _model),
        body
      });
    } else {
      const modelCopy = __spreadValues({}, __privateGet(this, _model));
      (_b = (_a = __privateGet(this, _model)).onCall) == null ? void 0 : _b.call(_a, modelCopy, body);
      const url = new URL(modelCopy.url || "");
      const headers = {
        "Content-Type": "application/json"
      };
      const formatHandlers = {
        "openai-chat": () => {
          headers["Authorization"] = `Bearer ${modelCopy.authKey}`;
        },
        anthropic: () => {
          headers["x-api-key"] = modelCopy.authKey;
          headers["anthropic-version"] = "2023-06-01";
        },
        gemini: () => {
        },
        grok: () => {
        }
      };
      formatHandlers[modelCopy.format]();
      result = await (await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body)
      })).json();
    }
    return { output: this.responseParser(result), raw: result };
  }
};
_model = new WeakMap();

// src/agent.ts
var createAgent = (opts) => new Agent(opts);
var createRoutingAgent = (opts) => new RoutingAgent(opts);
var Agent = class _Agent {
  constructor(opts) {
    this.name = opts.name;
    this.description = opts.description || "";
    this.system = opts.system;
    this.assistant = opts.assistant || "";
    this.tools = /* @__PURE__ */ new Map();
    this.tool_choice = opts.tool_choice;
    this.lifecycles = opts.lifecycle;
    this.model = opts.model;
    this.history = opts.history;
    this.setTools(opts.tools);
    this.mcpServers = opts.mcpServers;
    this._mcpClients = [];
  }
  setTools(tools) {
    for (const tool of tools || []) {
      if (isInngestFn(tool)) {
        this.tools.set(tool["absoluteId"], {
          name: tool["absoluteId"],
          description: tool.description,
          // TODO Should we error here if we can't find an input schema?
          parameters: getInngestFnInput(tool),
          handler: async (input, opts) => {
            const step = await getStepTools();
            if (!step) {
              throw new Error("Inngest tool called outside of Inngest context");
            }
            const stepId = `${opts.agent.name}/tools/${tool["absoluteId"]}`;
            return step.invoke(stepId, {
              function: (0, import_inngest4.referenceFunction)({
                appId: tool["client"]["id"],
                functionId: tool.id()
              }),
              data: input
            });
          }
        });
      } else {
        this.tools.set(tool.name, tool);
      }
    }
  }
  withModel(model) {
    return new _Agent({
      name: this.name,
      description: this.description,
      system: this.system,
      assistant: this.assistant,
      tools: Array.from(this.tools.values()),
      lifecycle: this.lifecycles,
      model
    });
  }
  /**
   * Run runs an agent with the given user input, treated as a user message.  If
   * the input is an empty string, only the system prompt will execute.
   */
  async run(input, { model, network, state, maxIter = 0 } = {}) {
    var _a, _b;
    await this.initMCP();
    const rawModel = model || this.model || (network == null ? void 0 : network.defaultModel);
    if (!rawModel) {
      throw new Error("No model provided to agent");
    }
    const p = createAgenticModelFromAiAdapter(rawModel);
    const s = state || (network == null ? void 0 : network.state) || new State();
    const run = new NetworkRun(
      network || createNetwork({ name: "default", agents: [] }),
      s
    );
    await initializeThread({
      state: s,
      history: this.history,
      input,
      network: run
    });
    await loadThreadFromStorage({
      state: s,
      history: this.history,
      input,
      network: run
    });
    let history = s ? s.formatHistory() : [];
    let prompt = await this.agentPrompt(input, run);
    let result = new AgentResult(
      this.name,
      [],
      [],
      /* @__PURE__ */ new Date(),
      prompt,
      history,
      ""
    );
    let hasMoreActions = true;
    let iter = 0;
    const initialResultCount = s.results.length;
    do {
      if ((_a = this.lifecycles) == null ? void 0 : _a.onStart) {
        const modified = await this.lifecycles.onStart({
          agent: this,
          network: run,
          input,
          prompt,
          history
        });
        if (modified.stop) {
          return result;
        }
        prompt = modified.prompt;
        history = modified.history;
      }
      const inference = await this.performInference(p, prompt, history, run);
      hasMoreActions = Boolean(
        this.tools.size > 0 && inference.output.length && inference.output[inference.output.length - 1].stop_reason !== "stop"
      );
      result = inference;
      history = [...inference.output];
      iter++;
    } while (hasMoreActions && iter < maxIter);
    if ((_b = this.lifecycles) == null ? void 0 : _b.onFinish) {
      result = await this.lifecycles.onFinish({
        agent: this,
        network: run,
        result
      });
    }
    await saveThreadToStorage({
      state: s,
      history: this.history,
      input,
      initialResultCount,
      network: run
    });
    return result;
  }
  async performInference(p, prompt, history, network) {
    var _a;
    const { output, raw } = await p.infer(
      this.name,
      prompt.concat(history),
      Array.from(this.tools.values()),
      this.tool_choice || "auto"
    );
    let result = new AgentResult(
      this.name,
      output,
      [],
      /* @__PURE__ */ new Date(),
      prompt,
      history,
      typeof raw === "string" ? raw : JSON.stringify(raw)
    );
    if ((_a = this.lifecycles) == null ? void 0 : _a.onResponse) {
      result = await this.lifecycles.onResponse({
        agent: this,
        network,
        result
      });
    }
    const toolCallOutput = await this.invokeTools(result.output, network);
    if (toolCallOutput.length > 0) {
      result.toolCalls = result.toolCalls.concat(toolCallOutput);
    }
    return result;
  }
  /**
   * invokeTools takes output messages from an inference call then invokes any tools
   * in the message responses.
   */
  async invokeTools(msgs, network) {
    const output = [];
    for (const msg of msgs) {
      if (msg.type !== "tool_call") {
        continue;
      }
      if (!Array.isArray(msg.tools)) {
        continue;
      }
      for (const tool of msg.tools) {
        const found = this.tools.get(tool.name);
        if (!found) {
          throw new Error(
            `Inference requested a non-existent tool: ${tool.name}`
          );
        }
        const result = await Promise.resolve(
          found.handler(tool.input, {
            agent: this,
            network,
            step: await getStepTools()
          })
        ).then((r) => {
          return {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            data: typeof r === "undefined" ? `${tool.name} successfully executed` : r
          };
        }).catch((err) => {
          return { error: (0, import_errors.serializeError)(err) };
        });
        output.push({
          role: "tool_result",
          type: "tool_result",
          tool: {
            type: "tool",
            id: tool.id,
            name: tool.name,
            input: tool.input.arguments
          },
          content: result,
          stop_reason: "tool"
        });
      }
    }
    return output;
  }
  async agentPrompt(input, network) {
    const messages = [
      {
        type: "text",
        role: "system",
        content: typeof this.system === "string" ? this.system : await this.system({ network })
      }
    ];
    if (input.length > 0) {
      messages.push({ type: "text", role: "user", content: input });
    }
    if (this.assistant.length > 0) {
      messages.push({
        type: "text",
        role: "assistant",
        content: this.assistant
      });
    }
    return messages;
  }
  // initMCP fetches all tools from the agent's MCP servers, adding them to the tool list.
  // This is all that's necessary in order to enable MCP tool use within agents
  async initMCP() {
    if (!this.mcpServers || this._mcpClients.length >= this.mcpServers.length) {
      return;
    }
    const promises = [];
    for (const server of this.mcpServers) {
      promises.push(this.listMCPTools(server));
    }
    await Promise.all(promises);
  }
  /**
   * listMCPTools lists all available tools for a given MCP server
   */
  async listMCPTools(server) {
    const client = await this.mcpClient(server);
    this._mcpClients.push(client);
    try {
      const results = await client.request(
        { method: "tools/list" },
        import_types6.ListToolsResultSchema
      );
      results.tools.forEach((t) => {
        const name = `${server.name}-${t.name}`;
        let zschema;
        try {
          zschema = import_json_schema_to_zod.JSONSchemaToZod.convert(t.inputSchema);
        } catch (e) {
          zschema = void 0;
        }
        this.tools.set(name, {
          name,
          description: t.description,
          parameters: zschema,
          mcp: {
            server,
            tool: t
          },
          handler: async (input) => {
            var _a;
            const fn = () => client.callTool({
              name: t.name,
              arguments: input
            });
            const step = await getStepTools();
            const result = await ((_a = step == null ? void 0 : step.run(name, fn)) != null ? _a : fn());
            return result.content;
          }
        });
      });
    } catch (e) {
      console.warn("error listing mcp tools", e);
    }
  }
  /**
   * mcpClient creates a new MCP client for the given server.
   */
  async mcpClient(server) {
    const transport = (() => {
      switch (server.transport.type) {
        case "streamable-http":
          return new import_streamableHttp.StreamableHTTPClientTransport(
            new URL(server.transport.url),
            {
              requestInit: server.transport.requestInit,
              authProvider: server.transport.authProvider,
              reconnectionOptions: server.transport.reconnectionOptions,
              sessionId: server.transport.sessionId
            }
          );
        case "sse":
          if (global.EventSource === void 0) {
            global.EventSource = import_eventsource.EventSource;
          }
          return new import_sse.SSEClientTransport(new URL(server.transport.url), {
            eventSourceInit: server.transport.eventSourceInit,
            requestInit: server.transport.requestInit
          });
        case "ws":
          return new import_websocket.WebSocketClientTransport(new URL(server.transport.url));
      }
    })();
    const client = new import_client.Client(
      {
        name: this.name,
        // XXX: This version should change.
        version: "1.0.0"
      },
      {
        capabilities: {}
      }
    );
    try {
      await client.connect(transport);
    } catch (e) {
      console.warn("mcp server disconnected", server, e);
    }
    return client;
  }
};
var RoutingAgent = class _RoutingAgent extends Agent {
  constructor(opts) {
    super(opts);
    this.type = "routing";
    this.lifecycles = opts.lifecycle;
  }
  withModel(model) {
    return new _RoutingAgent({
      name: this.name,
      description: this.description,
      system: this.system,
      assistant: this.assistant,
      tools: Array.from(this.tools.values()),
      lifecycle: this.lifecycles,
      model
    });
  }
};

// src/models.ts
var import_ai8 = require("@inngest/ai");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Agent,
  AgentResult,
  AgenticModel,
  Network,
  NetworkRun,
  RoutingAgent,
  State,
  anthropic,
  createAgent,
  createAgenticModelFromAiAdapter,
  createNetwork,
  createRoutingAgent,
  createState,
  createTool,
  gemini,
  getDefaultRoutingAgent,
  getInngestFnInput,
  getStepTools,
  grok,
  initializeThread,
  isInngestFn,
  loadThreadFromStorage,
  openai,
  saveThreadToStorage,
  stringifyError
});
//# sourceMappingURL=index.cjs.map