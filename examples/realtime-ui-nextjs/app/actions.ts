"use server";

import { randomUUID } from "crypto";
import { getSubscriptionToken } from "@inngest/realtime";

import { inngest } from "@/lib/inngest/client";
import { databaseAgentChannel } from "@/lib/inngest/functions";

// securely fetch an Inngest Realtime subscription token from the server as a server action
export async function fetchSubscriptionToken(threadId: string) {
  console.log("fetching subscription token for threadId", threadId);
  const token = await getSubscriptionToken(inngest, {
    channel: databaseAgentChannel(threadId),
    topics: ["messages", "status"],
  });

  return token;
}

export async function runDatabaseAgent(query: string) {
  const threadId = randomUUID();
  await inngest.send({
    name: "database-agent/run",
    data: { threadId, query },
  });

  return threadId;
}
