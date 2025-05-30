import { createAgent, createTool, openai } from "@inngest/agent-kit";
import { z } from "zod";
import { generateObject, generateText } from "ai";
import { openai as vercelOpenAI } from "@ai-sdk/openai";
import Exa from "exa-js";
import {
  NetworkState,
  ReasoningNode,
  ReasoningStage,
  ReasoningTree,
  Finding,
} from "../deep-research";
import { formatCitationIEEE, assignCitationNumbers } from "./citations";

/**
 * Configuration constants for search and content processing
 */
const SEARCH_CONFIG = {
  CONTENT_PREVIEW_LENGTH: 1000,
  ANALYSIS_CHARACTER_LIMIT: 4000,
  SEARCH_RESULTS_MULTIPLIER: 2, // Fetch 2x maxBreadth for deduplication
} as const;

/**
 * Helper function to generate a unique ID for reasoning nodes
 */
function generateNodeId(): string {
  return `node-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Find a node by ID in the reasoning tree
 */
function findNodeById(
  tree: ReasoningTree,
  nodeId: string
): ReasoningNode | undefined {
  return tree.nodes.find((node) => node.id === nodeId);
}

/**
 * Analyze a single search result
 */
async function analyzeSearchResult({
  query,
  reasoning,
  result,
  topic,
  stage,
  step,
  context,
}: {
  query: string;
  reasoning: string;
  result: any;
  topic: string;
  stage: ReasoningStage;
  step?: any;
  context?: string | null;
}): Promise<string> {
  const analysisResult = await step?.ai.wrap(
    "analyze-search-result",
    async () => {
      return await generateText({
        model: vercelOpenAI("gpt-4o"),
        prompt: `
        You are a research expert analyzing a specific search result in relation to a research query.

        Here is the original query for the research we are doing:
        
        TOPIC: ${topic}
        ${context ? `ADDITIONAL CONTEXT: ${context}` : ""}

        Current stage of research:
        STAGE: ${stage.name}
        STAGE DESCRIPTION: ${stage.description}

        Here is the specific query we made to our search engine:
        QUERY: ${query}
        REASONING BEHIND QUERY: ${reasoning}
        
        Here is the search result we got from our search engine:
        SEARCH RESULT URL: ${result.url}
        SEARCH RESULT TITLE: ${result.title || "No title"}
        
        SEARCH RESULT CONTENT:
        ${result.text || "No content available"}
        
        Provide a thoughtful analysis of this single search result that:
        1. Extracts the key information relevant to the query and overall research topic
        2. Evaluates the credibility and relevance of the source
        3. Identifies important insights, facts, or perspectives provided
        4. Notes any limitations or biases in this particular source

        Make sure to include comprehensive technical details including any tables or facts that we
        can use to expand our understanding of the topic. Don't just summarize the result, but 
        provide a detailed analysis of the result and how it contributes to our understanding of the topic
        while also noting down important facts, technical details, and any other information that we can use
        to expand our understanding of the topic.
        
        Your analysis should be focused specifically on this single result and what it contributes 
        to understanding the query. Limit your analysis to about ${
          SEARCH_CONFIG.ANALYSIS_CHARACTER_LIMIT
        } characters.
      `,
      });
    }
  );

  return analysisResult?.text || "No analysis could be generated.";
}

/**
 * Research a specific node by collecting findings from web search using Exa API
 * Modified to return maxBreadth results per query with deduplication
 */
async function researchNode({
  node,
  stage,
  topic,
  step,
  state,
}: {
  node: ReasoningNode;
  stage: ReasoningStage;
  topic: string;
  step?: any;
  state: NetworkState;
}): Promise<Finding[]> {
  try {
    // Initialize Exa client
    const exa = new Exa(process.env.EXA_API_KEY || "");

    // Ensure searchedUrls exists in state
    if (!state.searchedUrls) {
      state.searchedUrls = new Set<string>();
    }

    // Get maxBreadth from configuration
    const maxBreadth = state.configuration?.maxBreadth || 3;

    // Prepare the search query by combining the stage context and the specific query
    const searchQuery = `${topic} - ${node.query}`;

    // Perform the search and get content with Exa
    const searchResults = await step?.ai.wrap("exa-search", async () => {
      try {
        const results = await exa.searchAndContents(searchQuery, {
          text: true,
          numResults: maxBreadth * SEARCH_CONFIG.SEARCH_RESULTS_MULTIPLIER, // Fetch 2x maxBreadth for deduplication
          highlightMatches: true, // Highlight matching terms
        });

        return results;
      } catch (error) {
        console.error("Exa search error:", error);
        return { results: [] };
      }
    });

    // Extract and format findings from the search results
    const findings: Finding[] = [];

    // Deduplicate search results based only on URL
    const dedupedResults = [];
    if (searchResults?.results && searchResults.results.length > 0) {
      for (const result of searchResults.results) {
        if (!result.text || !result.url) continue;

        // Check if we've already analyzed this URL in this stage
        if (
          state.searchedUrls.has(result.url) &&
          state.analysisCache?.has(result.url)
        ) {
          // Reuse the existing analysis
          findings.push({
            source: result.url,
            content:
              result.text.substring(0, SEARCH_CONFIG.CONTENT_PREVIEW_LENGTH) +
              (result.text.length > SEARCH_CONFIG.CONTENT_PREVIEW_LENGTH
                ? "..."
                : ""),
            analysis: state.analysisCache.get(result.url),
            title: result.title || null,
            author: result.author || null,
            publishedDate: result.publishedDate || null,
            favicon: result.favicon || null,
            image: result.image || null,
          });

          // If we have enough findings already, we can stop
          if (findings.length >= maxBreadth) break;

          // Skip to next result without adding to dedupedResults
          continue;
        }

        // Skip already seen URLs (that don't have cached analysis)
        if (state.searchedUrls.has(result.url)) {
          continue;
        }

        // Track this URL
        state.searchedUrls.add(result.url);
        dedupedResults.push(result);

        // Stop if we have enough unique results (considering both cached and new)
        if (
          dedupedResults.length >= maxBreadth ||
          findings.length + dedupedResults.length >= maxBreadth
        )
          break;
      }
    }

    // Process deduplicated results to add to findings
    if (dedupedResults.length > 0) {
      // Only process enough results to reach maxBreadth total findings
      const remainingSlots = maxBreadth - findings.length;
      const resultsToProcess = dedupedResults.slice(0, remainingSlots);

      // Create analysis promises for results we'll actually use
      const analysisPromises = resultsToProcess.map((result) =>
        analyzeSearchResult({
          query: node.query,
          reasoning: node.reasoning || "No reasoning provided",
          result,
          topic,
          stage,
          step,
          context: state.context,
        })
      );

      // Execute all analyses in parallel
      const analyses = await Promise.all(analysisPromises);

      // Process the results
      resultsToProcess.forEach((result, index) => {
        const analysis = analyses[index];

        // Cache the analysis for potential reuse
        if (!state.analysisCache) {
          state.analysisCache = new Map<string, string>();
        }
        state.analysisCache.set(result.url, analysis);

        // Create a finding with the analysis
        findings.push({
          source: result.url,
          content:
            result.text.substring(0, SEARCH_CONFIG.CONTENT_PREVIEW_LENGTH) +
            (result.text.length > SEARCH_CONFIG.CONTENT_PREVIEW_LENGTH
              ? "..."
              : ""),
          analysis, // Include the analysis with the finding
          title: result.title || null,
          author: result.author || null,
          publishedDate: result.publishedDate || null,
          favicon: result.favicon || null,
          image: result.image || null,
        });
      });
    }

    return findings;
  } catch (error) {
    console.error(`Error researching node ${node.id}:`, error);

    // Return empty findings array on error
    return [];
  }
}

/**
 * Generate follow-up queries based on all findings from depth 0
 */
async function generateFollowUpQueries({
  initialFindings,
  originalQueries,
  stage,
  topic,
  step,
  maxBreadth,
}: {
  initialFindings: Finding[];
  originalQueries: string[];
  stage: ReasoningStage;
  topic: string;
  step?: any;
  maxBreadth: number;
}): Promise<any> {
  // Extract all analyses from the findings
  const allAnalyses = initialFindings
    .filter((finding) => finding.analysis)
    .map((finding) => finding as Finding);

  // Build citation numbering for this stage based on first appearance order
  const citationMap = assignCitationNumbers(
    allAnalyses.filter(
      (f, idx, arr) => arr.findIndex((x) => x.source === f.source) === idx
    )
  );

  // Build reference list markdown lines
  const referenceLines = Array.from(citationMap.entries()).map(([url, num]) => {
    const finding = allAnalyses.find((f) => f.source === url)!;
    return formatCitationIEEE(finding, num);
  });

  // Build analyses with citation prefixes
  const analysesWithCites = allAnalyses.map((finding) => {
    const num = citationMap.get(finding.source);
    return `[${num}] ANALYSIS (from ${finding.source}):\n${finding.analysis}`;
  });

  const followupResult = await step?.ai.wrap(
    "generate-followup-queries",
    async () => {
      return await generateObject({
        model: vercelOpenAI("gpt-4o"),
        schema: z.object({
          followupQueries: z
            .array(
              z.object({
                query: z
                  .string()
                  .describe(
                    "The specific follow-up research question to explore"
                  ),
                reasoning: z
                  .string()
                  .describe(
                    "Detailed reasoning behind why this follow-up query is important"
                  ),
              })
            )
            .length(maxBreadth)
            .describe(
              `Exactly ${maxBreadth} follow-up queries that will deepen the research`
            ),
        }),
        prompt: `
        You are a research expert generating follow-up queries based on initial research findings.
        
        TOPIC: ${topic}
        STAGE: ${stage.name}
        STAGE DESCRIPTION: ${stage.description}
        
        ORIGINAL QUERIES THAT HAVE ALREADY BEEN RESEARCHED:
        ${originalQueries.map((q, i) => `${i + 1}. ${q}`).join("\n")}
        
        SOURCES (use [n] inline when citing):
        ${referenceLines.join("\n")}
        
        Based on the following analyses from all research findings (each prefixed with its citation number):
        ${analysesWithCites.join("\n\n")}
        
        Generate exactly ${maxBreadth} follow-up queries that will deepen the research further.
        These queries should:
        1. Address important gaps or open questions from the initial findings
        2. Explore promising areas identified but not fully covered in the initial research
        3. Represent distinct angles that together provide comprehensive coverage
        4. Be specific enough for effective web searches
        5. Include detailed reasoning explaining why each query is important
        6. NOT duplicate any of the original queries listed above
        
        The follow-up queries should not duplicate the initial research, but rather build upon 
        and extend the knowledge already gathered.
      `,
      });
    }
  );

  return followupResult?.object?.followupQueries || [];
}

/**
 * Calculate the maximum character limit for stage-level analysis based on input volume
 */
function calculateStageLevelLimit(allAnalyses: Finding[]): number {
  return allAnalyses
    .map((finding) => finding.analysis?.length || 0)
    .reduce((sum, len) => sum + len, 0);
}

/**
 * Generate stage analysis based on all findings from depth 0 and depth 1
 */
async function generateStageAnalysis({
  allFindings,
  stage,
  topic,
  step,
}: {
  allFindings: Finding[];
  stage: ReasoningStage;
  topic: string;
  step?: any;
}): Promise<string> {
  // Extract all analyses from the findings
  const allAnalyses = allFindings
    .filter((finding) => finding.analysis)
    .map((finding) => finding as Finding);

  // Calculate the stage-level character limit
  const stageLevelLimit = calculateStageLevelLimit(allAnalyses);

  // Build citation numbering for this stage based on first appearance order
  const citationMap = assignCitationNumbers(
    allAnalyses.filter(
      (f, idx, arr) => arr.findIndex((x) => x.source === f.source) === idx
    )
  );

  // Build reference list markdown lines
  const referenceLines = Array.from(citationMap.entries()).map(([url, num]) => {
    const finding = allAnalyses.find((f) => f.source === url)!;
    return formatCitationIEEE(finding, num);
  });

  // Build analyses with citation prefixes
  const analysesWithCites = allAnalyses.map((finding) => {
    const num = citationMap.get(finding.source);
    return `[${num}] ANALYSIS (from ${finding.source}):\n${finding.analysis}`;
  });

  const analysisResult = await step?.ai.wrap(
    "generate-stage-analysis",
    async () => {
      return await generateText({
        model: vercelOpenAI("gpt-4o"),
        prompt: `
        You are a research expert creating a comprehensive analysis for a research stage.
        
        TOPIC: ${topic}
        STAGE: ${stage.name}
        STAGE DESCRIPTION: ${stage.description}
        
        SOURCES (use [n] inline when citing):
        ${referenceLines.join("\n")}
        
        Based on the following analyses from all research findings (each prefixed with its citation number):
        ${analysesWithCites.join("\n\n")}
        
        Generate a comprehensive analysis of this entire research stage that:
        1. Synthesizes key insights across all findings
        2. Draws parallels between each of the provided findings/analyses
        3. Identifies patterns, trends, and consensus views
        4. Highlights important contradictions or areas of debate
        5. Evaluates the overall strength of evidence
        6. Discusses implications of these findings for the broader topic
        7. Notes remaining gaps or questions for future research
        
        Your analysis should provide a clear, coherent narrative of what we've learned about this aspect 
        of the topic through our research. Structure this as a comprehensive multi-page report that 
        synthesizes all findings into a cohesive narrative. Your response should come close to but not exceed ${stageLevelLimit} 
        characters, as this represents the total volume of analysis being synthesized.

        When writing your stage analysis, cite information inline using the IEEE style [n] where n corresponds 
        to the source number above. End your analysis with a **References** section that repeats the list 
        exactly as provided above.
      `,
      });
    }
  );

  return analysisResult?.text || "No analysis could be generated.";
}

/**
 * BuildReasoningTree Tool
 *
 * This tool builds or expands a reasoning tree for the current stage.
 * Modified to implement the new structure with web searches at both levels.
 */
export const buildReasoningTreeTool = createTool({
  name: "build_reasoning_tree",
  description: "Build a reasoning tree for the current stage",
  handler: async ({}, { network, step }) => {
    if (!network) return { error: "Network state unavailable" };

    const state = network.state.data as NetworkState;
    const {
      topic,
      context,
      configuration,
      reasoningStages = [],
      currentStageIndex = 0,
    } = state;

    if (!configuration) {
      return { error: "Configuration is required but not provided" };
    }

    const { maxDepth, maxBreadth } = configuration;

    // Clear caches at the start of each stage
    // We check if this is the first call for this stage by looking at whether any nodes have findings
    const currentStage = reasoningStages[currentStageIndex];
    const isNewStage =
      currentStage &&
      currentStage.reasoningTree?.nodes &&
      currentStage.reasoningTree.nodes.every(
        (node) => !node.findings || node.findings.length === 0
      );

    if (isNewStage) {
      if (!state.searchedUrls) {
        state.searchedUrls = new Set<string>();
      } else {
        state.searchedUrls.clear();
      }

      if (!state.analysisCache) {
        state.analysisCache = new Map<string, string>();
      } else {
        state.analysisCache.clear();
      }
    }

    // Check if we have stages to work with
    if (!reasoningStages || reasoningStages.length === 0) {
      return {
        error: "No reasoning stages found. StagingAgent should run first.",
      };
    }

    // Get the current stage
    if (!currentStage) {
      return { error: `Invalid stage index: ${currentStageIndex}` };
    }

    try {
      // The staging agent now creates the initial tree with depth 0 nodes
      if (!currentStage.reasoningTree || !currentStage.reasoningTree.nodes) {
        return {
          error:
            "Reasoning tree not initialized by StagingAgent. This should not happen.",
        };
      }

      const tree = currentStage.reasoningTree;

      // Step 1: Research depth 0 nodes that don't have findings yet
      const depthZeroNodesWithoutFindings = tree.nodes.filter(
        (node) =>
          node.depth === 0 && (!node.findings || node.findings.length === 0)
      );

      if (depthZeroNodesWithoutFindings.length > 0) {
        // Process up to maxBreadth depth 0 nodes in parallel
        const nodesToProcess = depthZeroNodesWithoutFindings.slice(
          0,
          maxBreadth
        );

        // Research nodes in parallel
        const researchResults = await Promise.all(
          nodesToProcess.map(async (nodeToResearch) => {
            // Research the node with Exa API
            const findings = await researchNode({
              node: nodeToResearch,
              stage: currentStage,
              topic: topic || "Unknown topic",
              step,
              state,
            });

            return { nodeId: nodeToResearch.id, findings };
          })
        );

        // Update nodes with findings
        researchResults.forEach(({ nodeId, findings }) => {
          const node = findNodeById(tree, nodeId);
          if (node) {
            node.findings = findings;
          }
        });

        // Update the state
        network.state.data = {
          ...state,
          reasoningStages: [
            ...reasoningStages.slice(0, currentStageIndex),
            currentStage,
            ...reasoningStages.slice(currentStageIndex + 1),
          ],
        };

        return {
          success: true,
          message: `Researched ${researchResults.length} depth 0 nodes in parallel`,
          researchedNodeCount: researchResults.length,
          totalFindingsCount: researchResults.reduce(
            (sum, { findings }) => sum + findings.length,
            0
          ),
          stageComplete: false,
        };
      }

      // Step 2: Check if all depth 0 nodes have findings and we haven't reached maxDepth
      const allDepthZeroNodes = tree.nodes.filter((node) => node.depth === 0);
      const allDepthZeroComplete = allDepthZeroNodes.every(
        (node) => node.findings && node.findings.length > 0
      );
      const currentMaxDepth = Math.max(...tree.nodes.map((node) => node.depth));
      const canAddMoreDepth = currentMaxDepth < maxDepth - 1;

      if (allDepthZeroComplete && canAddMoreDepth) {
        // Collect all findings from depth 0 nodes
        const allDepthZeroFindings = allDepthZeroNodes.flatMap(
          (node) => node.findings
        );

        // Generate follow-up queries based on all depth 0 findings
        const followupQueries = await generateFollowUpQueries({
          initialFindings: allDepthZeroFindings,
          originalQueries: allDepthZeroNodes.map((node) => node.query),
          stage: currentStage,
          topic: topic || "Unknown topic",
          step,
          maxBreadth, // Pass maxBreadth from configuration
        });

        // Create depth 1 nodes from follow-up queries (limited by maxBreadth)
        const depthOneNodes: ReasoningNode[] = followupQueries
          .slice(0, maxBreadth)
          .map((q: any) => {
            const nodeId = generateNodeId();
            return {
              id: nodeId,
              parentId: null, // These are not children of specific depth 0 nodes, but follow-ups to all depth 0
              depth: currentMaxDepth + 1,
              query: q.query,
              reasoning: q.reasoning,
              findings: [], // No findings yet
              children: [], // No children
            };
          });

        // Add depth 1 nodes to the tree
        tree.nodes = [...tree.nodes, ...depthOneNodes];

        // Update the state
        network.state.data = {
          ...state,
          reasoningStages: [
            ...reasoningStages.slice(0, currentStageIndex),
            currentStage,
            ...reasoningStages.slice(currentStageIndex + 1),
          ],
        };

        return {
          success: true,
          message: `Generated ${depthOneNodes.length} follow-up queries based on all depth 0 findings`,
          newNodeCount: depthOneNodes.length,
          stageComplete: false,
        };
      }

      // Step 3: Research nodes at deeper depths that don't have findings
      const deeperNodesForResearch = tree.nodes.filter(
        (node) =>
          node.depth > 0 && (!node.findings || node.findings.length === 0)
      );

      if (deeperNodesForResearch.length > 0) {
        // Process up to maxBreadth nodes in parallel
        const nodesToProcess = deeperNodesForResearch.slice(0, maxBreadth);

        // Research nodes in parallel
        const researchResults = await Promise.all(
          nodesToProcess.map(async (nodeToResearch) => {
            // Research the node with Exa API
            const findings = await researchNode({
              node: nodeToResearch,
              stage: currentStage,
              topic: topic || "Unknown topic",
              step,
              state,
            });

            return { nodeId: nodeToResearch.id, findings };
          })
        );

        // Update nodes with findings
        researchResults.forEach(({ nodeId, findings }) => {
          const node = findNodeById(tree, nodeId);
          if (node) {
            node.findings = findings;
          }
        });

        // Update the state
        network.state.data = {
          ...state,
          reasoningStages: [
            ...reasoningStages.slice(0, currentStageIndex),
            currentStage,
            ...reasoningStages.slice(currentStageIndex + 1),
          ],
        };

        return {
          success: true,
          message: `Researched ${researchResults.length} deeper nodes in parallel`,
          researchedNodeCount: researchResults.length,
          totalFindingsCount: researchResults.reduce(
            (sum, { findings }) => sum + findings.length,
            0
          ),
          stageComplete: false,
        };
      }

      // Step 4: Check if all nodes have been researched and generate stage analysis
      const allNodes = tree.nodes;
      const allNodesComplete = allNodes.every(
        (node) => node.findings && node.findings.length > 0
      );

      if (allNodesComplete && !currentStage.analysis) {
        // Collect all findings from all nodes
        const allFindings = allNodes.flatMap((node) => node.findings);

        // Generate comprehensive stage analysis
        const stageAnalysis = await generateStageAnalysis({
          allFindings,
          stage: currentStage,
          topic: topic || "Unknown topic",
          step,
        });

        // Add analysis to the stage
        currentStage.analysis = stageAnalysis;
        currentStage.reasoningComplete = true;
        currentStage.analysisComplete = true;

        // Update the state
        network.state.data = {
          ...state,
          reasoningStages: [
            ...reasoningStages.slice(0, currentStageIndex),
            currentStage,
            ...reasoningStages.slice(currentStageIndex + 1),
          ],
        };

        return {
          success: true,
          message: "Stage analysis complete",
          analysis: stageAnalysis,
          totalNodeCount: tree.nodes.length,
          stageComplete: true,
        };
      }

      // If we reached here, the stage is complete
      if (currentStage.reasoningComplete && currentStage.analysisComplete) {
        return {
          success: true,
          message: "Stage already complete",
          stageComplete: true,
        };
      }

      return {
        success: true,
        message: "No actions needed at this time",
        stageComplete: false,
      };
    } catch (error) {
      console.error("=== BUILD REASONING TREE TOOL ERROR ===");
      console.error(error);

      return {
        success: false,
        error: String(error),
      };
    }
  },
});

/**
 * ReasoningAgent
 *
 * This agent is responsible for building reasoning trees for each stage.
 * Modified to implement the new research approach with web searches at both levels.
 */
export const reasoningAgent = createAgent<NetworkState>({
  name: "Reasoning Agent",
  description: "Builds reasoning trees to explore research stages",
  system: `You are an expert researcher building reasoning trees for exploring complex topics.
  
Your primary responsibility is to generate and expand research queries that deeply explore the current reasoning stage.

When invoked, you will:
1. Check which stage of reasoning is currently active
2. Review the stage description to understand the focus
3. Use the 'build_reasoning_tree' tool to:
   - Research initial depth 0 queries with web searches
   - Generate follow-up queries based on initial findings
   - Research these follow-up queries
   - Create a comprehensive stage analysis

Your goal is to build a comprehensive research foundation for each stage:
- First level: 3 initial queries with 3 search results each (9 total)
- Second level: 3 follow-up queries with 3 search results each (9 more)
- Final analysis: Synthesize all 18 search results into a stage analysis

Continue using the 'build_reasoning_tree' tool until the entire research and analysis is complete.`,
  model: openai({ model: "gpt-4o" }),
  tools: [buildReasoningTreeTool],
  lifecycle: {
    onStart: async ({ input, network, prompt, history }) => {
      return {
        prompt,
        history: history || [],
        stop: false,
      };
    },
    onFinish: async ({ result, network }) => {
      return result;
    },
  },
});
