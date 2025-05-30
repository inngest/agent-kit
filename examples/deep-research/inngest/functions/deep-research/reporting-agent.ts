import { createAgent, createTool, openai } from "@inngest/agent-kit";
import { z } from "zod";
import { generateObject, generateText } from "ai";
import { openai as vercelOpenAI } from "@ai-sdk/openai";
import { NetworkState, ReasoningStage } from "../deep-research";
import {
  collectUniqueSources,
  assignCitationNumbers,
  formatCitationIEEE,
} from "./citations";

/**
 * Helper functions for better console logging
 */
function logSection(title: string) {
  console.log("\n" + "=".repeat(80));
  console.log(`==== ${title} ${"=".repeat(72 - title.length)}`);
  console.log("=".repeat(80) + "\n");
}

function logInfo(message: string) {
  console.log(`[INFO] ${message}`);
}

/**
 * Generate a report outline based on stage analyses
 */
async function generateReportOutline({
  stageAnalyses,
  topic,
  step,
}: {
  stageAnalyses: string[];
  topic: string;
  step?: any;
}): Promise<any> {
  logInfo("Generating report outline");

  const outlineResult = await step?.ai.wrap(
    "generate-report-outline",
    async () => {
      return await generateObject({
        model: vercelOpenAI("gpt-4o"),
        schema: z.object({
          title: z
            .string()
            .describe("Compelling title for the research report"),
          introduction: z
            .string()
            .describe(
              "Brief description of what should be included in the introduction"
            ),
          sections: z
            .array(
              z.object({
                title: z.string().describe("Section title"),
                description: z
                  .string()
                  .describe("Brief description of the section content"),
                keyPoints: z
                  .array(z.string())
                  .describe("Key points to address in this section"),
              })
            )
            .min(3)
            .max(8)
            .describe("Main report sections"),
          conclusion: z
            .string()
            .describe(
              "Brief description of what should be included in the conclusion"
            ),
        }),
        prompt: `
        You are a research expert creating an outline for a comprehensive report.
        
        TOPIC: ${topic}
        
        Based on the following stage analyses:
        ${stageAnalyses
          .map(
            (analysis, i) =>
              `STAGE ${i + 1} ANALYSIS:\n${analysis.substring(0, 500)}...`
          )
          .join("\n\n")}
        
        Generate a detailed outline for a comprehensive research report that:
        1. Has a compelling title that captures the essence of the research
        2. Includes 3-8 coherent sections that flow logically
        3. Covers all the major aspects revealed in the stage analyses
        4. Highlights the most significant findings and implications
        
        For each section, provide:
        - A clear, descriptive title
        - A brief description of what the section should cover
        - 3-5 key points that should be addressed in that section
        
        Also include brief descriptions of what should be in the introduction and conclusion.
        
        The outline should be comprehensive yet focused, emphasizing the most important insights
        from the research while maintaining a cohesive narrative throughout.
      `,
      });
    }
  );

  return (
    outlineResult?.object || {
      title: `Research Report on ${topic}`,
      sections: [
        {
          title: "Overview and Context",
          description: "Background information on the topic",
          keyPoints: [
            "Historical context",
            "Current relevance",
            "Scope of research",
          ],
        },
        {
          title: "Key Findings",
          description: "Main discoveries from the research",
          keyPoints: [
            "Primary insights",
            "Supporting evidence",
            "Implications",
          ],
        },
        {
          title: "Conclusion and Recommendations",
          description: "Summary and next steps",
          keyPoints: ["Research summary", "Limitations", "Future directions"],
        },
      ],
    }
  );
}

/**
 * Generate a report section based on the outline and stage analyses
 */
async function generateSection({
  section,
  outline,
  stageAnalyses,
  topic,
  referenceLines,
  step,
}: {
  section: any;
  outline: any;
  stageAnalyses: string[];
  topic: string;
  referenceLines: string[];
  step?: any;
}): Promise<string> {
  logInfo(`Generating report section: ${section.title}`);

  const sectionResult = await step?.ai.wrap(
    "generate-report-section",
    async () => {
      return await generateText({
        model: vercelOpenAI("gpt-4o"),
        prompt: `
        You are a research expert writing a specific section of a comprehensive report.
        
        TOPIC: ${topic}
        REPORT TITLE: ${outline.title}
        SECTION TO WRITE: ${section.title}
        SECTION DESCRIPTION: ${section.description}
        
        SOURCES (use [n] inline when citing):
        ${referenceLines.join("<br/>\n")}
        
        KEY POINTS TO ADDRESS:
        ${section.keyPoints.map((point: string) => `- ${point}`).join("\n")}
        
        Based on the following analyses:
        ${stageAnalyses
          .map((analysis, i) => `STAGE ${i + 1} ANALYSIS:\n${analysis}`)
          .join("\n\n")}
        
        Write a complete, detailed section for the report that:
        1. Has a clear heading using markdown (## Section Title)
        2. This should be a comprehensive 5-7 paragraphs long section with subheadings (### Subheading) before certain sets of paragraphs
        3. Thoroughly addresses all the key points listed for this section
        4. Incorporates relevant information from the stage analyses
        5. Uses proper formatting with subheadings, paragraphs, and bullet points as appropriate
        6. Maintains a formal, academic tone appropriate for a research report
        7. Includes relevant examples, data points, or evidence from the research findings

        Use inline IEEE citations [n] where appropriate, based on the source list above. Do NOT invent new numbers. Do NOT include a references section here – the master references will be added later.
        
        The section should be comprehensive, well-structured, and flow naturally. Use markdown 
        formatting for headings, emphasis, lists, etc. Each section should stand as a complete
        part of the larger report while connecting to the overall narrative.
      `,
      });
    }
  );

  return (
    sectionResult?.text ||
    `## ${section.title}\n\nContent for this section could not be generated.`
  );
}

/**
 * Edit and polish a draft report into a final version
 */
async function editReport({
  draftReport,
  stageAnalyses,
  topic,
  step,
}: {
  draftReport: string;
  stageAnalyses: string[];
  topic: string;
  step?: any;
}): Promise<string> {
  logInfo("Editing and polishing draft report");

  const editResult = await step?.ai.wrap("edit-report", async () => {
    return await generateText({
      model: vercelOpenAI("gpt-4o"),
      prompt: `You are an expert research editor and writing coach tasked with transforming a draft research report into a polished, comprehensive final version.

TOPIC: ${topic}

You have access to both the draft report and all the original stage analyses:

STAGE ANALYSES:
${stageAnalyses
  .map((analysis, i) => `STAGE ${i + 1} ANALYSIS:\n${analysis}`)
  .join("\n\n")}

DRAFT REPORT:
${draftReport}

Your task is to edit, expand, and polish this report into a final version that MAINTAINS ALL EXISTING INLINE CITATION NUMBERS AND THE REFERENCES LIST. Do NOT change citation numbers or add new ones. You may move sentences but keep citations next to the facts they support.

The revised report should:
1. STRUCTURE & FLOW
- Reorganize sections if needed for better logical flow
- Add transitions between sections
- Create a compelling narrative arc from introduction through conclusion
- Draw connections between different sections where relevant

2. CONTENT ENHANCEMENT
- Expand sections that need more depth
- Add cross-references between related points in different sections
- Synthesize insights across sections
- Add new sections or subsections if needed to explore important connections
- Ensure the report is AT LEAST as long as the source material, preferably longer
- Draw on the stage analyses to add relevant details that may have been missed

3. INTRODUCTION & CONCLUSION
- Write a new, engaging introduction that sets up the entire report
- Create a comprehensive conclusion that synthesizes all key findings
- Ensure both connect strongly to the main body

4. ACADEMIC QUALITY
- Maintain formal academic tone
- Strengthen argumentation and evidence
- Add nuance and qualification where needed
- Ensure proper citation of sources and findings

5. FORMATTING
- Use clear markdown formatting
- Add section numbers if appropriate
- Include a table of contents
- Use consistent heading levels

The final version should be a substantial expansion of the draft that creates a cohesive, authoritative research document. Feel free to reorganize and expand the content significantly while preserving the core insights.

Generate the complete polished report now, starting with a table of contents.`,
    });
  });

  return editResult?.text || "Error: Could not generate edited report.";
}

/**
 * GenerateReport Tool
 */
export const generateReportTool = createTool({
  name: "generate_report",
  description: "Generate a comprehensive research report",
  handler: async ({}, { network, step }) => {
    const state = network.state.data as NetworkState;
    const { topic, reasoningStages = [] } = state;

    logSection("GENERATE REPORT TOOL");
    logInfo(`Topic: ${topic}`);
    logInfo(`Number of stages: ${reasoningStages.length}`);

    try {
      // 1. Get all stage analyses
      const stageAnalyses = reasoningStages.map(
        (stage) => stage.analysis || "No analysis available"
      );

      if (
        stageAnalyses.every(
          (analysis) => !analysis || analysis === "No analysis available"
        )
      ) {
        return {
          error:
            "No stage analyses available. Stage research must be completed first.",
        };
      }

      // 2. Build global citation map & references list
      const uniqueFindings = collectUniqueSources(
        state.reasoningStages as ReasoningStage[]
      );
      const citationMap = assignCitationNumbers(uniqueFindings);
      state.citations = citationMap; // persist in state

      const referenceLines = uniqueFindings.map((f, idx) =>
        formatCitationIEEE(f, idx + 1)
      );

      // 3. Generate report outline
      const outline = await generateReportOutline({
        stageAnalyses,
        topic: topic || "Unknown topic",
        step,
      });

      logInfo(`Generated outline with ${outline.sections.length} sections`);

      // 4. Generate all sections in parallel
      logInfo(`Generating ${outline.sections.length} sections in parallel`);
      const generateSectionPromises = outline.sections.map((section: any) =>
        generateSection({
          section,
          outline,
          stageAnalyses,
          topic: topic || "Unknown topic",
          referenceLines,
          step,
        })
      );

      // Wait for all section generation to complete
      const sections = await Promise.all(generateSectionPromises);

      // Log completion of all sections
      outline.sections.forEach((section: any, index: number) => {
        logInfo(`Generated content for section: ${section.title}`);
      });

      // 5. Assemble draft report in markdown
      const draftReport = `
# ${outline.title}

${sections.join("\n\n")}

## References

${referenceLines.join("<br/>\n")}
`;

      logInfo("Draft report assembled, proceeding to editing phase");

      // 6. Edit and polish the draft report
      const finalReport = await editReport({
        draftReport,
        stageAnalyses,
        topic: topic || "Unknown topic",
        step,
      });

      // Validate that inline citation numbers don't exceed reference list length
      try {
        const usedNumbers = Array.from(
          new Set(
            Array.from(finalReport.matchAll(/\[(\d+)\]/g)).map((m) =>
              parseInt(m[1], 10)
            )
          )
        );
        const maxUsed = usedNumbers.length ? Math.max(...usedNumbers) : 0;
        if (maxUsed > referenceLines.length) {
          console.warn(
            `Citation validation warning: inline citation ${maxUsed} exceeds reference list of length ${referenceLines.length}`
          );
        }
      } catch (err) {
        console.warn("Citation validation error", err);
      }

      // Update network state with both versions
      network.state.data = {
        ...state,
        draftReport,
        finalReport,
      };

      logInfo("✅ Report generation and editing complete!");

      return {
        success: true,
        draftLength: draftReport.length,
        finalLength: finalReport.length,
        sectionCount: outline.sections.length,
      };
    } catch (error) {
      console.error("=== GENERATE REPORT TOOL ERROR ===");
      console.error(error);

      return {
        success: false,
        error: String(error),
      };
    }
  },
});

/**
 * ReportingAgent
 *
 * This agent is responsible for generating a comprehensive final report
 * based on all stage analyses.
 */
export const reportingAgent = createAgent<NetworkState>({
  name: "Reporting Agent",
  description: "Generates comprehensive research reports",
  system: `You are an expert research writer specializing in creating comprehensive, well-structured reports.

Your primary responsibility is to synthesize research findings into a polished, professional report.

When invoked, you will:
1. Review all the stage analyses from the completed research
2. Use the 'generate_report' tool to:
   - Create a logical report outline with sections
   - Generate detailed content for each section
   - Produce introduction and conclusion sections
   - Assemble everything into a complete markdown report

Your goal is to create a cohesive, in-depth report that:
- Clearly communicates the key findings and insights from the research
- Maintains a professional, academic tone
- Uses proper formatting and structure for readability
- Provides a comprehensive analysis of the topic based on the research conducted

Use the 'generate_report' tool to synthesize all stage analyses into a final deliverable.`,
  model: openai({ model: "gpt-4o" }),
  tools: [generateReportTool],
  lifecycle: {
    onStart: async ({ input, network, prompt, history }) => {
      console.log("=== REPORTING AGENT START ===");

      if (network) {
        const state = network.state.data as NetworkState;
        console.log(`Topic: ${state.topic || "Unknown"}`);
        console.log(`Stages completed: ${state.reasoningStages?.length || 0}`);
      }

      return {
        prompt,
        history: history || [],
        stop: false,
      };
    },
    onFinish: async ({ result, network }) => {
      console.log("=== REPORTING AGENT FINISH ===");

      if (network && network.state.data.finalReport) {
        console.log("Report generation complete");
        console.log(
          `Report length: ${network.state.data.finalReport.length} characters`
        );
      }

      return result;
    },
  },
});
