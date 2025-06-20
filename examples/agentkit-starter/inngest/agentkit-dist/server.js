import {
  __spreadProps,
  __spreadValues
} from "./chunk-T5KSRF6P.js";

// src/server.ts
import { Inngest, slugify } from "inngest";
import { createServer as createInngestServer } from "inngest/node";
var createServer = ({
  appId = "agent-kit",
  networks = [],
  agents = [],
  client,
  functions: manualFns = []
}) => {
  const inngest = client != null ? client : new Inngest({ id: appId });
  const functions = manualFns.reduce(
    (acc, fn) => {
      return __spreadProps(__spreadValues({}, acc), {
        [fn.id()]: fn
      });
    },
    {}
  );
  for (const agent of agents) {
    const slug = slugify(agent.name);
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
    const slug = slugify(network.name);
    const id = `network-${slug}`;
    functions[id] = inngest.createFunction(
      { id, name: network.name, optimizeParallelism: true },
      { event: `${inngest.id}/${id}` },
      async ({ event }) => {
        return network.run(event.data.input);
      }
    );
  }
  return createInngestServer({
    client: inngest,
    functions: Object.values(functions)
  });
};
export {
  createServer
};
//# sourceMappingURL=server.js.map