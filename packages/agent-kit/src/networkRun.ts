import { RoutingAgent, type Agent } from "./agent";
import { getDefaultRoutingAgent, Network } from "./network";
import { type State, type StateData } from "./state";

export class NetworkRun<T extends StateData> extends Network<T> {
  constructor(network: Network<T>, state: State<T>) {
    super({
      name: network.name,
      description: network.description,
      agents: Array.from(network.agents.values()),
      defaultModel: network.defaultModel,
      defaultState: network.state,
      router: network.router,
      maxIter: network.maxIter,
    });

    this.state = state;
  }

  public override run(): never {
    throw new Error("NetworkRun does not support run");
  }

  public override async availableAgents(): Promise<Agent<T>[]> {
    return super.availableAgents(this);
  }

  /**
   * Schedule is used to push an agent's run function onto the stack.
   */
  schedule(agentName: string) {
    this["_stack"].push(agentName);
  }

  private async execute(
    ...[input, overrides]: Network.RunArgs<T>
  ): Promise<this> {
    const available = await this.availableAgents();
    if (available.length === 0) {
      throw new Error("no agents enabled in network");
    }

    // If there's no default agent used to run the request, use our internal
    // routing agent which attempts to figure out the best agent to choose based
    // off of the network.
    const next = await this.getNextAgents(
      input,
      overrides?.router || overrides?.defaultRouter || this.router
    );
    if (!next?.length) {
      // TODO: If call count is 0, error.
      return this;
    }

    // Schedule the agent to run on our stack, then start popping off the stack.
    for (const agent of next) {
      this.schedule(agent.name);
    }

    while (
      this._stack.length > 0 &&
      (this.maxIter === 0 || this._counter < this.maxIter)
    ) {
      // XXX: It would be possible to parallel call these agents here by
      // fetching the entire stack, parallel running, then awaiting the
      // responses.   However, this confuses history and we'll take our time to
      // introduce parallelisation after the foundations are set.

      // Fetch the agent we need to call next off of the stack.
      const agentName = this._stack.shift();
      // Grab agents from the private map, as this may have been introduced in
      // the router.
      const agent = agentName && this._agents.get(agentName);
      if (!agent) {
        // We're done.
        return this;
      }

      // We force Agent to emit structured output in case of the use of tools by
      // setting maxIter to 0.
      const call = await agent.run(input, { network: this, maxIter: 0 });
      this._counter += 1;

      // Ensure that we store the call network history.
      this.state.append(call);

      // Here we face a problem: what's the definition of done?   An agent may
      // have just been called with part of the information to solve an input.
      // We may need to delegate to another agent.
      //
      // In this case, we defer to the router provided to give us next steps.
      // By default, this is an agentic router which takes the current state,
      // agents, then figures out next steps.  This can, and often should, be
      // custom code.
      const next = await this.getNextAgents(
        input,
        overrides?.router || overrides?.defaultRouter || this.router
      );
      for (const a of next || []) {
        this.schedule(a.name);
      }
    }

    return this;
  }

  private async getNextAgents(
    input: string,
    router?: Network.Router<T>
  ): Promise<Agent<T>[] | undefined> {
    // A router may do one of two things:
    //
    //   1. Return one or more Agents to run
    //   2. Return undefined, meaning we're done.
    //
    // It can do this by using code, or by calling routing agents directly.
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

    // This is a function call which determines the next agent to call.  Note that the result
    // of this function call may be another RoutingAgent.
    const stack: Agent<T>[] = this._stack.map((name) => {
      const agent = this._agents.get(name);
      if (!agent) {
        throw new Error(`unknown agent in the network stack: ${name}`);
      }
      return agent;
    });

    const agent = await router({
      input,
      network: this,
      stack,
      lastResult: this.state.results.pop(),
      callCount: this._counter,
    });
    if (!agent) {
      return;
    }
    if (agent instanceof RoutingAgent) {
      // Functions may also return routing agents.
      return await this.getNextAgentsViaRoutingAgent(agent, input);
    }

    for (const a of Array.isArray(agent) ? agent : [agent]) {
      // Ensure this agent is part of the network.  If not, we're going to
      // automatically add it.
      if (!this._agents.has(a.name)) {
        this._agents.set(a.name, a);
      }
    }

    return Array.isArray(agent) ? agent : [agent];
  }

  private async getNextAgentsViaRoutingAgent(
    routingAgent: RoutingAgent<T>,
    input: string
  ): Promise<Agent<T>[] | undefined> {
    const result = await routingAgent.run(input, {
      network: this,
      model: routingAgent.model || this.defaultModel,
    });
    const agentNames = routingAgent.lifecycles.onRoute({
      result,
      agent: routingAgent,
      network: this,
    });

    return (agentNames || [])
      .map((name) => this.agents.get(name))
      .filter(Boolean) as Agent<T>[];
  }
}
