import { z } from "zod";
import {
  anthropic,
  createAgent,
  createNetwork,
  createTool,
  Tool,
} from "@inngest/agent-kit";
import { channel, topic } from "@inngest/realtime";

import { inngest } from "./client";

export interface NetworkState {
  // answer from the Database Administrator Agent
  dba_agent_answer?: string;

  // answer from the Security Expert Agent
  security_agent_answer?: string;
}

// create a channel for each discussion, given a thread ID. A channel is a namespace for one or more topics of streams.
export const databaseAgentChannel = channel(
  (threadId: string) => `thread:${threadId}`
)
  // Add a specific topic, eg. "ai" for all AI data within the user's channel
  .addTopic(
    topic("messages").schema(
      z.object({
        message: z.string(),
        id: z.string(),
      })
    )
  )
  .addTopic(
    topic("status").schema(
      z.object({
        status: z.enum(["running", "completed", "error"]),
      })
    )
  );

export const databaseAgentFunction = inngest.createFunction(
  {
    id: "database-agent",
  },
  {
    event: "database-agent/run",
  },
  async ({ event, publish }) => {
    const { query, threadId } = event.data;

    await publish(databaseAgentChannel(threadId).status({ status: "running" }));

    const dbaAgent = createAgent({
      name: "Database administrator",
      description: "Provides expert support for managing PostgreSQL databases",
      system:
        "You are a PostgreSQL expert database administrator. " +
        "You only provide answers to questions linked to Postgres database schema, indexes, extensions.",
      model: anthropic({
        model: "claude-3-5-haiku-latest",
        defaultParameters: {
          max_tokens: 4096,
        },
      }),
      tools: [
        createTool({
          name: "provide_answer",
          description: "Provide the answer to the questions",
          parameters: z.object({
            answer: z.string(),
          }),
          handler: async (
            { answer },
            { network }: Tool.Options<NetworkState>
          ) => {
            network.state.data.dba_agent_answer = answer;

            await publish(
              databaseAgentChannel(threadId).messages({
                message: `The Database administrator Agent has the following recommendation: ${network.state.data.dba_agent_answer}`,
                id: crypto.randomUUID(),
              })
            );
          },
        }),
      ],
    });

    const securityAgent = createAgent({
      name: "Database Security Expert",
      description:
        "Provides expert guidance on PostgreSQL security, access control, audit logging, and compliance best practices",
      system:
        "You are a PostgreSQL security expert. " +
        "Provide answers to questions linked to PostgreSQL security topics such as encryption, access control, audit logging, and compliance best practices.",
      model: anthropic({
        model: "claude-3-5-haiku-latest",
        defaultParameters: {
          max_tokens: 4096,
        },
      }),
      tools: [
        createTool({
          name: "provide_answer",
          description: "Provide the answer to the questions",
          parameters: z.object({
            answer: z.string(),
          }),
          handler: async (
            { answer },
            { network }: Tool.Options<NetworkState>
          ) => {
            network.state.data.security_agent_answer = answer;

            await publish(
              databaseAgentChannel(threadId).messages({
                message: `The Security Expert Agent has the following recommendation: ${network.state.data.security_agent_answer}`,
                id: crypto.randomUUID(),
              })
            );
          },
        }),
      ],
    });

    const network = createNetwork<NetworkState>({
      name: "Database Agent",
      agents: [dbaAgent, securityAgent],
      router: async ({ network }) => {
        if (
          network.state.data.dba_agent_answer &&
          !network.state.data.security_agent_answer
        ) {
          return securityAgent;
        } else if (
          network.state.data.security_agent_answer &&
          network.state.data.dba_agent_answer
        ) {
          return;
        }
        return dbaAgent;
      },
    });

    await network.run(query);

    await publish(
      databaseAgentChannel(threadId).status({ status: "completed" })
    );
  }
);
