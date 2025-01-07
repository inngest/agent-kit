import { Inngest, type InngestFunction } from "inngest";
import { createServer as createInngestServer } from "inngest/node";

import { type Network } from "./network";
import { type Agent } from "./agent";

function slugify(str: string): string {
  return str
    .replace(/^\s+|\s+$/g, "") // trim leading/trailing white space
    .toLowerCase() // convert string to lowercase
    .replace(/[^a-z0-9 -]/g, "") // remove any non-alphanumeric characters
    .replace(/\s+/g, "-") // replace spaces with hyphens
    .replace(/-+/g, "-"); // remove consecutive hyphens
}

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
  networks = [],
  agents = [],
}: {
  networks?: Network[];
  agents?: Agent[];
}) => {
  const appId = "agent-kit";
  const inngest = new Inngest({
    id: appId,
  });
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
  let networkIdx = 0;
  for (const network of networks) {
    networkIdx++;
    const name = network.name ?? `My network #${networkIdx}`;
    if (!network.name) {
      console.warn(
        `Network missing 'name' option. Created generic name: ${name}`
      );
    }
    const slug = slugify(name);
    const id = `network-${slug}`;
    functions[id] = inngest.createFunction(
      { id, name },
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
