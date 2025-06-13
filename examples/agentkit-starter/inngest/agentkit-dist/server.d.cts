import * as http from 'http';
import { InngestFunction, Inngest } from 'inngest';
import { N as Network, A as Agent } from './agent-QzIKahV1.cjs';
import '@inngest/ai';
import 'inngest/components/InngestFunction';
import 'zod';
import 'inngest/experimental';
import '@modelcontextprotocol/sdk/client/streamableHttp.js';
import '@modelcontextprotocol/sdk/client/auth.js';

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
declare const createServer: ({ appId, networks, agents, client, functions: manualFns, }: {
    appId?: string;
    networks?: Network<any>[];
    agents?: Agent<any>[];
    functions?: InngestFunction.Any[];
    client?: Inngest.Any;
}) => http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>;

export { createServer };
