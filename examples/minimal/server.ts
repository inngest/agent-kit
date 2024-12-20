import { type Network, type Agent } from "@inngest/agent-kit";
import { Inngest } from "inngest"
import { createServer as createInngestServer } from "inngest/node"

function slugify(str) {
  str = str.replace(/^\s+|\s+$/g, ''); // trim leading/trailing white space
  str = str.toLowerCase(); // convert string to lowercase
  str = str.replace(/[^a-z0-9 -]/g, '') // remove any non-alphanumeric characters
           .replace(/\s+/g, '-') // replace spaces with hyphens
           .replace(/-+/g, '-'); // remove consecutive hyphens
  return str;
}

export const createServer = ({
  networks = [],
  agents = [],
}: {
  // networks?: Network[],
  networks?: { name: string, net: Network}[],
  agents?: Agent[],
}) => {
  const inngest = new Inngest({ id: 'agent-kit' })
  // todo type this
  let functions: any[] = [];
  for (const agent of agents) {
    const id = slugify(agent.name);
    functions[id] = inngest.createFunction(
      { id, name: agent.name },
      { event: `agentkit/agent-${id}` },
      async ({ event }) => {
        return agent.run(event.data.input)
      }
    )
  }
  for (const network of networks) {
    const id = slugify(network.name);
    functions[id] = inngest.createFunction(
      { id, name: network.name },
      { event: `agentkit/network-${id}` },
      async ({ event }) => {
        return network.net.run(event.data.input)
      }
    )
    // const id = slugify(network.name);
    // functions[id] = inngest.createFunction(
    //   { id, name: network.name },
    //   { event: `agentkit/network-${id}` },
    //   async ({ event }) => {
    //     return network.run(event.data.input)
    //   }
    // )
  }
  return createInngestServer({
    client: inngest,
    functions:Object.values(functions),
  })
}