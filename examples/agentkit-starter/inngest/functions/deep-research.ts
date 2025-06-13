import { createState, createNetwork, openai } from "@inngest/agent-kit";
import { inngest } from "../client";
import { z } from "zod";

// Import agents
import { stagingAgent } from "./deep-research/staging-agent";
import { reasoningAgent } from "./deep-research/reasoning-agent";
import { reportingAgent } from "./deep-research/reporting-agent";

// Reasoning tree related interfaces
export interface ReasoningStage {
  id: number;
  name: string;
  description: string;
  reasoningTree?: ReasoningTree;
  reasoningComplete: boolean;
  analysisComplete: boolean;
  analysis?: string;
}

export interface ReasoningTree {
  nodes: ReasoningNode[];
}

export interface ReasoningNode {
  id: string;
  parentId: string | null;
  depth: number;
  query: string;
  reasoning: string;
  findings: Finding[];
  reflection?: string;
  children: string[];
}

export interface Finding {
  source: string;
  content: string;
  analysis?: string;
  title?: string | null;
  author?: string | null;
  publishedDate?: string | null;
  favicon?: string | null;
  image?: string | null;
}

// Define the NetworkState
export interface NetworkState {
  // Initial input data
  topic?: string;
  context?: string | null;

  // Research configuration
  configuration?: {
    maxDepth: number; // Maximum depth of the reasoning tree
    maxBreadth: number; // Maximum breadth (nodes per level)
    stageCount: number; // Number of research stages
    queriesPerStage: number; // Initial queries per stage
  };

  // Research stages and progress tracking
  reasoningStages?: ReasoningStage[];
  stagingComplete?: boolean;
  currentStageIndex?: number;
  finalAnalysis?: string;
  draftReport?: string; // Initial draft before editing
  finalReport?: string; // Final polished version

  // Flow control
  networkComplete?: boolean; // Set when the network is complete

  // Deduplication tracking
  searchedUrls?: Set<string>; // URLs that have already been searched
  analysisCache?: Map<string, string>; // Cache of URL to analysis mapping for reuse

  // Citation numbering map (url -> number) generated during reporting
  citations?: Map<string, number>;

  // Session tracking
  "session-uuid"?: string;
}

// Update the event interface to match our data structure
interface ProgressEventFinding {
  source: string;
  content: string;
  analysis?: string;
  title?: string | null;
  author?: string | null;
  publishedDate?: string | null;
  favicon?: string | null;
  image?: string | null;
}

interface ProgressEventNode {
  id: string;
  parentId: string | null;
  depth: number;
  query: string;
  reasoning: string;
  findings: ProgressEventFinding[];
  reflection?: string;
  children: string[];
}

interface ProgressEventStage {
  id: number;
  name: string;
  description: string;
  analysis?: string;
  reasoningComplete: boolean;
  analysisComplete: boolean;
  reasoningTree?: {
    nodes: ProgressEventNode[];
  };
}

interface ProgressEvent {
  type: "deep-research";
  eventType: "progress" | "complete" | "error";
  message: string;
  timestamp: string;
  stage?: {
    index: number;
    name: string;
    description: string;
    totalStages?: number;
    reasoningTree?: {
      nodes: ProgressEventNode[];
    };
  } | null;
  agent?: string | null;
  progress?: {
    percent: number;
    currentStep?: string;
    totalSteps?: number;
  } | null;
  tree?: {
    nodeCount?: number;
    maxDepth?: number;
    nodesWithFindings?: number;
  } | null;
  analysis?: string | null;
  completed?: boolean;
  findings?: ProgressEventFinding[] | null;
  stages?: ProgressEventStage[] | null;
}

/**
 * Helper function to publish standardized progress events
 */
function publishProgressEvent({
  publish,
  uuid,
  type = "progress",
  message,
  stage = null,
  agent = null,
  progress = null,
  tree = null,
  analysis = null,
  completed = false,
  findings = null,
  stages = null,
}: {
  publish: any;
  uuid: string;
  type?: "progress" | "complete" | "error";
  message: string;
  stage?: {
    index: number;
    name: string;
    description: string;
    totalStages?: number;
    reasoningTree?: ReasoningTree;
  } | null;
  agent?: string | null;
  progress?: {
    percent: number;
    currentStep?: string;
    totalSteps?: number;
  } | null;
  tree?: {
    nodeCount?: number;
    maxDepth?: number;
    nodesWithFindings?: number;
  } | null;
  analysis?: string | null;
  completed?: boolean;
  findings?: Finding[] | null;
  stages?: ReasoningStage[] | null;
}) {
  return publish({
    channel: `deep-research.${uuid}`,
    topic: "updates",
    data: {
      type: "deep-research",
      eventType: type,
      message,
      timestamp: new Date().toISOString(),
      stage: stage && {
        ...stage,
        reasoningTree: stage.reasoningTree && {
          nodes: stage.reasoningTree.nodes.map((node) => ({
            id: node.id,
            parentId: node.parentId,
            depth: node.depth,
            query: node.query,
            reasoning: node.reasoning,
            findings: node.findings.map((finding) => ({
              source: finding.source,
              content: finding.content,
              analysis: finding.analysis,
              title: finding.title ?? null,
              author: finding.author ?? null,
              publishedDate: finding.publishedDate ?? null,
              favicon: finding.favicon ?? null,
              image: finding.image ?? null,
            })),
            reflection: node.reflection,
            children: node.children,
          })),
        },
      },
      agent,
      progress,
      tree,
      analysis,
      completed,
      findings: findings?.map((finding) => ({
        source: finding.source,
        content: finding.content,
        analysis: finding.analysis,
        title: finding.title ?? null,
        author: finding.author ?? null,
        publishedDate: finding.publishedDate ?? null,
        favicon: finding.favicon ?? null,
        image: finding.image ?? null,
      })),
      stages: stages?.map((stage) => ({
        id: stage.id,
        name: stage.name,
        description: stage.description,
        analysis: stage.analysis,
        reasoningTree: stage.reasoningTree && {
          nodes: stage.reasoningTree.nodes.map((node) => ({
            id: node.id,
            parentId: node.parentId,
            depth: node.depth,
            query: node.query,
            reasoning: node.reasoning,
            findings: node.findings.map((finding) => ({
              source: finding.source,
              content: finding.content,
              analysis: finding.analysis,
            })),
            reflection: node.reflection,
            children: node.children,
          })),
        },
      })),
    } as ProgressEvent,
  });
}

export const deepResearchAgent = inngest.createFunction(
  {
    id: "deep-research-agent-workflow",
  },
  {
    event: "deep-research/run",
  },
  async ({ step, event, publish }) => {
    const { topic, context, uuid, configuration: eventConfig } = event.data;

    // Send initial starting event
    await publishProgressEvent({
      publish,
      uuid,
      type: "progress",
      message: "Starting deep research analysis",
      agent: null,
      progress: {
        percent: 0,
        currentStep: "Initializing research",
        totalSteps: 1, // Will be updated once we know total stages
      },
    });

    // Create the network with our agents
    const researchNetwork = createNetwork({
      name: "Deep Research Network",
      agents: [stagingAgent, reasoningAgent, reportingAgent],
      maxIter: 25,
      defaultModel: openai({ model: "gpt-4o" }),
      defaultState: createState<NetworkState>({
        topic: undefined,
        context: null,
        configuration: eventConfig, // Use configuration from event
        reasoningStages: [],
        stagingComplete: false,
        currentStageIndex: 0,
        searchedUrls: new Set<string>(),
        analysisCache: new Map<string, string>(),
        "session-uuid": undefined,
      }),
      router: async ({ network }) => {
        const state = network.state.data;

        // Router logic
        console.log(
          "ROUTER STATE:",
          JSON.stringify(
            {
              topic: state.topic,
              stagingComplete: state.stagingComplete,
              currentStageIndex: state.currentStageIndex,
              stageCount: state.reasoningStages?.length || 0,
              networkComplete: state.networkComplete,
            },
            null,
            2
          )
        );

        // If network is complete, stop
        if (state.networkComplete) {
          console.log("ROUTER: Network completed. Stopping.");
          await publishProgressEvent({
            publish,
            uuid,
            type: "complete",
            message: `Research completed`,
            analysis: state.finalAnalysis,
            completed: true,
            progress: {
              percent: 100,
              currentStep: "Complete",
            },
          });
          return undefined;
        }

        // If staging is not complete, route to StagingAgent
        if (!state.stagingComplete) {
          console.log("ROUTER: Staging not complete. Routing to StagingAgent.");
          await publishProgressEvent({
            publish,
            uuid,
            message: `Creating reasoning stages for ${topic}`,
            agent: "StagingAgent",
            progress: {
              percent: 10,
              currentStep: "Planning research stages",
            },
          });
          return stagingAgent;
        }

        // If we just completed staging, publish all stages
        if (
          state.stagingComplete &&
          state.reasoningStages &&
          state.reasoningStages.length > 0
        ) {
          await publishProgressEvent({
            publish,
            uuid,
            message: `Research stages created`,
            agent: "StagingAgent",
            stages: state.reasoningStages,
            progress: {
              percent: 15,
              currentStep: "Research stages defined",
              totalSteps: (state.reasoningStages?.length || 0) * 2, // Each stage has reasoning and analysis
            },
          });

          // After publishing stages, immediately start with the first stage
          // Don't fall through to the next logic - route to reasoning agent
          const firstStage = state.reasoningStages[0];
          if (firstStage && !firstStage.reasoningComplete) {
            console.log(
              "ROUTER: Staging complete. Starting first stage with ReasoningAgent."
            );
            return reasoningAgent;
          }
        }

        // Get current stage
        const currentStageIndex = state.currentStageIndex || 0;
        const currentStage = state.reasoningStages?.[currentStageIndex];
        const totalStages = state.reasoningStages?.length || 1;

        if (!currentStage) {
          console.error(
            "ROUTER: No current stage found. This should not happen."
          );
          state.networkComplete = true;
          await publishProgressEvent({
            publish,
            uuid,
            type: "error",
            message: `No stage found at index ${currentStageIndex}`,
            progress: {
              percent: 100,
              currentStep: "Error",
            },
          });
          return undefined;
        }

        // Calculate overall progress based on stage and completion status
        const stageProgress = (currentStageIndex / totalStages) * 100;
        const stageWeight = 100 / totalStages;
        let currentProgress = stageProgress;

        // If current stage reasoning is not complete, route to ReasoningAgent
        if (!currentStage.reasoningComplete) {
          console.log(
            `ROUTER: Reasoning for stage "${currentStage.name}" not complete. Routing to ReasoningAgent.`
          );

          await publishProgressEvent({
            publish,
            uuid,
            message: `Building reasoning tree for stage: ${currentStage.name}`,
            stage: {
              index: currentStageIndex,
              name: currentStage.name,
              description: currentStage.description,
              totalStages,
              reasoningTree: currentStage.reasoningTree && {
                nodes: currentStage.reasoningTree.nodes.map((node) => ({
                  id: node.id,
                  parentId: node.parentId,
                  depth: node.depth,
                  query: node.query,
                  reasoning: node.reasoning,
                  findings: node.findings.map((finding) => ({
                    source: finding.source,
                    content:
                      finding.content.substring(0, 200) +
                      (finding.content.length > 200 ? "..." : ""),
                    analysis: finding.analysis || "Analysis pending...",
                    title: finding.title ?? null,
                    author: finding.author ?? null,
                    publishedDate: finding.publishedDate ?? null,
                    favicon: finding.favicon ?? null,
                    image: finding.image ?? null,
                  })),
                  reflection: node.reflection,
                  children: node.children,
                })),
              },
            },
            agent: "ReasoningAgent",
            progress: {
              percent: Math.min(Math.round(currentProgress), 95),
              currentStep: `Stage ${currentStageIndex + 1}/${totalStages}: ${
                currentStage.reasoningTree?.nodes.length
                  ? `Exploring ${
                      currentStage.reasoningTree.nodes[
                        currentStage.reasoningTree.nodes.length - 1
                      ].query
                    }`
                  : "Starting research"
              }`,
              totalSteps: totalStages * 2,
            },
            tree: currentStage.reasoningTree?.nodes
              ? {
                  nodeCount: currentStage.reasoningTree.nodes.length,
                  maxDepth: Math.max(
                    ...currentStage.reasoningTree.nodes.map((n) => n.depth)
                  ),
                  nodesWithFindings: currentStage.reasoningTree.nodes.filter(
                    (n) => n.findings.length > 0
                  ).length,
                }
              : null,
          });
          return reasoningAgent;
        }

        // Move to next stage if available
        if (currentStageIndex < (state.reasoningStages?.length || 0) - 1) {
          state.currentStageIndex = currentStageIndex + 1;
          console.log(
            `ROUTER: Moving to next stage ${state.currentStageIndex}`
          );

          // Stage complete, update progress
          currentProgress += stageWeight; // Full stage weight

          const nextStage = state.reasoningStages?.[state.currentStageIndex];

          await publishProgressEvent({
            publish,
            uuid,
            message: `Completed stage: ${currentStage.name}, moving to: ${nextStage?.name}`,
            stage: {
              index: state.currentStageIndex,
              name: nextStage?.name || "Unknown",
              description: nextStage?.description || "",
              totalStages,
            },
            progress: {
              percent: Math.min(Math.round(currentProgress), 95),
              currentStep: `Stage ${
                state.currentStageIndex + 1
              }/${totalStages}: Starting`,
              totalSteps: totalStages * 2,
            },
          });
          return reasoningAgent; // Start the next stage with reasoning
        }

        // Check if we need to generate the final report
        if (!state.finalReport) {
          console.log("ROUTER: All stages complete. Generating final report.");
          await publishProgressEvent({
            publish,
            uuid,
            message: `Generating comprehensive research report`,
            agent: "ReportingAgent",
            progress: {
              percent: 97,
              currentStep: "Generating final report",
            },
          });
          return reportingAgent;
        }

        // If the report is complete, mark the network as complete
        console.log("ROUTER: Report complete. Marking network complete.");
        state.networkComplete = true;

        await publishProgressEvent({
          publish,
          uuid,
          type: "complete",
          message: `All stages complete. Research report generated.`,
          progress: {
            percent: 99,
            currentStep: "Finalizing",
          },
        });
        return undefined;
      },
    });

    // Create a properly typed state for this run
    const state = createState<NetworkState>({
      topic: topic,
      context: context,
      configuration: eventConfig, // Use configuration from event
      reasoningStages: [],
      stagingComplete: false,
      currentStageIndex: 0,
      searchedUrls: new Set<string>(),
      analysisCache: new Map<string, string>(),
      "session-uuid": uuid,
    });

    // Initial progress event
    await publishProgressEvent({
      publish,
      uuid,
      message: `Starting research on topic: ${topic}`,
      progress: {
        percent: 5,
        currentStep: "Initializing",
      },
    });

    // Run the research network
    const response = await researchNetwork.run(topic, { state });

    await step.sleep("sleep", "1s");

    // Get all findings with their analyses
    const allFindings =
      response.state.data.reasoningStages?.flatMap(
        (stage) =>
          stage.reasoningTree?.nodes.flatMap((node) =>
            node.findings.map((finding) => ({
              source: finding.source,
              content: finding.content,
              analysis:
                finding.analysis ||
                response.state.data.analysisCache?.get(finding.source) ||
                "Analysis pending...",
            }))
          ) || []
      ) || [];

    // Final analysis
    const finalReport = response.state.data.finalReport;

    // Final complete event with full data
    await publishProgressEvent({
      publish,
      uuid,
      type: "complete",
      message: `Research completed with ${allFindings.length} findings across ${
        response.state.data.reasoningStages?.length || 0
      } stages`,
      analysis: finalReport,
      completed: true,
      progress: {
        percent: 100,
        currentStep: "Complete",
      },
    });

    return {
      response,
      finalReport: response.state.data.finalReport,
    };
  }
);
