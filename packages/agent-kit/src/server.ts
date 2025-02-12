import { Inngest, slugify, type InngestFunction } from "inngest";
import { createServer as createInngestServer } from "inngest/node";
import { type Agent } from "./agent";
import { type Network } from "./network";

/**
 * Create a server to serve Agents and Networks as Inngest functions
 *
 * @example
 * ```ts
 * import { createServer, createAgent, createNetwork } from "@inngest/agent-kit";
 *
 * const myAgent = createAgent(...);
 * const myNetwork = createNetwork(...);
 * const server = createServer({
 *   agents: [myAgent],
 *   networks: [myNetworks],
 * });
 * server.listen(3000)
 * ```
 *
 * @public
 */
export const createServer = ({
  appId = "agent-kit",
  networks = [],
  agents = [],
  client,
  functions: manualFns = [],
}: {
  appId?: string;
  networks?: (
    | Network
    | {
        options: Omit<
          InngestFunction.Options,
          "id" | "triggers" | "middleware" | "onFailure"
        >;
        network: Network;
      }
  )[];
  agents?: (
    | Agent
    | {
        options: Omit<
          InngestFunction.Options,
          "id" | "triggers" | "middleware" | "onFailure"
        >;
        agent: Agent;
      }
  )[];
  functions?: InngestFunction.Any[];
  client?: Inngest.Any;
}) => {
  const inngest = client ?? new Inngest({ id: appId });

  const functions = manualFns.reduce<Record<string, InngestFunction.Any>>(
    (acc, fn) => {
      return {
        ...acc,
        [fn.id()]: fn,
      };
    },
    {}
  );

  for (const agentOrObject of agents) {
    const agent =
      "agent" in agentOrObject ? agentOrObject.agent : agentOrObject;
    const customFunctionConfig =
      "agent" in agentOrObject ? agentOrObject.options : undefined;
    const slug = slugify(agent.name);
    const id = `agent-${slug}`;

    functions[id] = inngest.createFunction(
      { id, name: agent.name, ...customFunctionConfig },
      { event: `${inngest.id}/${id}` },
      async ({ event }) => {
        // eslint-disable-next-line
        return agent.run(event.data.input);
      }
    );
  }

  for (const networkOrObject of networks) {
    const network =
      "network" in networkOrObject ? networkOrObject.network : networkOrObject;
    const customFunctionConfig =
      "network" in networkOrObject ? networkOrObject.options : undefined;
    const slug = slugify(network.name);
    const id = `network-${slug}`;

    functions[id] = inngest.createFunction(
      { id, name: network.name, ...customFunctionConfig },
      { event: `${inngest.id}/${id}` },
      async ({ event }) => {
        // eslint-disable-next-line
        return network.run(event.data.input);
      }
    );
  }

  return createInngestServer({
    client: inngest,
    functions: Object.values(functions),
  });
};
