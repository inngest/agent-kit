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

// src/server.ts
var server_exports = {};
__export(server_exports, {
  createServer: () => createServer
});
module.exports = __toCommonJS(server_exports);
var import_inngest5 = require("inngest");
var import_node = require("inngest/node");

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

// src/tool.ts
var import_inngest3 = require("inngest");
var import_zod3 = require("zod");

// src/network.ts
var import_ai = require("@inngest/ai");
var import_zod2 = require("zod");

// src/util.ts
var import_inngest = require("inngest");
var import_InngestFunction = require("inngest/components/InngestFunction");
var import_experimental = require("inngest/experimental");
var import_zod = require("zod");

// src/history.ts
var import_inngest2 = require("inngest");

// src/adapters/openai.ts
var import_ai3 = require("@inngest/ai");
var import_zod_to_json_schema2 = require("zod-to-json-schema");

// src/adapters/gemini.ts
var import_ai4 = require("@inngest/ai");
var import_zod5 = require("zod");
var import_zod_to_json_schema3 = require("zod-to-json-schema");

// src/server.ts
var createServer = ({
  appId = "agent-kit",
  networks = [],
  agents = [],
  client,
  functions: manualFns = []
}) => {
  const inngest = client != null ? client : new import_inngest5.Inngest({ id: appId });
  const functions = manualFns.reduce(
    (acc, fn) => {
      return __spreadProps(__spreadValues({}, acc), {
        [fn.id()]: fn
      });
    },
    {}
  );
  for (const agent of agents) {
    const slug = (0, import_inngest5.slugify)(agent.name);
    const id = `agent-${slug}`;
    functions[id] = inngest.createFunction(
      { id, name: agent.name, optimizeParallelism: true },
      { event: `${inngest.id}/${id}` },
      async ({ event }) => {
        return agent.run(event.data.input);
      }
    );
  }
  for (const network of networks) {
    const slug = (0, import_inngest5.slugify)(network.name);
    const id = `network-${slug}`;
    functions[id] = inngest.createFunction(
      { id, name: network.name, optimizeParallelism: true },
      { event: `${inngest.id}/${id}` },
      async ({ event }) => {
        return network.run(event.data.input);
      }
    );
  }
  return (0, import_node.createServer)({
    client: inngest,
    functions: Object.values(functions)
  });
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createServer
});
//# sourceMappingURL=server.cjs.map