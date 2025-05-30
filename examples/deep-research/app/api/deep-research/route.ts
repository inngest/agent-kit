import crypto from "crypto";
import { inngest } from "@/inngest/client";
import { subscribe } from "@inngest/realtime";

// Define the request body interface
interface DeepResearchRequest {
  topic: string;
  context?: string;
  useV2?: boolean;
  configuration?: {
    maxDepth?: number; // Maximum depth of the reasoning tree
    maxBreadth?: number; // Maximum breadth (nodes per level)
    stageCount?: number; // Number of research stages
    queriesPerStage?: number; // Initial queries per stage
  };
}

// Define configuration limits
const CONFIG_LIMITS = {
  maxDepth: { min: 1, max: 3, default: 2 },
  maxBreadth: { min: 2, max: 5, default: 3 },
  stageCount: { min: 1, max: 5, default: 3 },
  queriesPerStage: { min: 1, max: 5, default: 3 },
};

// Validate and normalize configuration
function validateConfig(config?: DeepResearchRequest["configuration"]) {
  const validated = {
    maxDepth: config?.maxDepth ?? CONFIG_LIMITS.maxDepth.default,
    maxBreadth: config?.maxBreadth ?? CONFIG_LIMITS.maxBreadth.default,
    stageCount: config?.stageCount ?? CONFIG_LIMITS.stageCount.default,
    queriesPerStage:
      config?.queriesPerStage ?? CONFIG_LIMITS.queriesPerStage.default,
  };

  // Clamp values to their limits
  validated.maxDepth = Math.min(
    Math.max(validated.maxDepth, CONFIG_LIMITS.maxDepth.min),
    CONFIG_LIMITS.maxDepth.max
  );
  validated.maxBreadth = Math.min(
    Math.max(validated.maxBreadth, CONFIG_LIMITS.maxBreadth.min),
    CONFIG_LIMITS.maxBreadth.max
  );
  validated.stageCount = Math.min(
    Math.max(validated.stageCount, CONFIG_LIMITS.stageCount.min),
    CONFIG_LIMITS.stageCount.max
  );
  validated.queriesPerStage = Math.min(
    Math.max(validated.queriesPerStage, CONFIG_LIMITS.queriesPerStage.min),
    CONFIG_LIMITS.queriesPerStage.max
  );

  return validated;
}

export async function POST(req: Request) {
  const json = (await req.json()) as DeepResearchRequest;
  const { topic, context, useV2 = true, configuration } = json;

  if (!topic) {
    return new Response(
      JSON.stringify({ error: "A research topic is required" }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }

  const uuid = crypto.randomUUID();
  const validatedConfig = validateConfig(configuration);

  await inngest.send({
    name: "deep-research/run",
    data: {
      uuid,
      topic,
      context: context || "",
      useV2,
      configuration: validatedConfig,
    },
  });

  const stream = await subscribe({
    app: inngest,
    channel: `deep-research.${uuid}`,
    topics: ["updates"], // subscribe to updates from the research process
  });

  return new Response(stream.getEncodedStream(), {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
