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
}: {
  appId?: string;
  networks?: Network[];
  agents?: Agent[];
}) => {
  const inngest = new Inngest({ id: appId });

  const functions: { [keyof: string]: InngestFunction.Any } = {};

  for (const agent of agents) {
    const slug = slugify(agent.name);
    const id = `agent-${slug}`;

    functions[id] = inngest.createFunction(
      { id, name: agent.name },
      { event: `${appId}/${id}` },
      async ({ event }) => {
        // eslint-disable-next-line
        return agent.run(event.data.input);
      }
    );
  }

  for (const network of networks) {
    const slug = slugify(network.name);
    const id = `network-${slug}`;

    functions[id] = inngest.createFunction(
      { id, name: network.name },
      { event: `${appId}/${id}` },
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
