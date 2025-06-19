import { Finding, ReasoningStage } from "../deep-research";

/**
 * formatCitationIEEE
 *
 * Returns a markdown-formatted IEEE style reference string with an optional favicon image.
 * Example output:
 *   ![icon](https://example.com/favicon.ico) Author, "Title," 2024. [Online]. Available: https://example.com
 */
export function formatCitationIEEE(finding: Finding, index: number): string {
  // Build author segment – fallback to site host when missing
  const authorPart = finding.author ?? new URL(finding.source).hostname;
  const titlePart = finding.title ?? "Untitled";
  const datePart = finding.publishedDate ? `${finding.publishedDate}.` : "";

  const faviconMarkdown = finding.favicon
    ? `![icon](${finding.favicon})`
    : "📄";

  const linkedTitle = `[${titlePart}](${finding.source})`;

  const citationText = `${authorPart}, ${linkedTitle}, ${datePart} [Online].`
    .replace(/\n/g, " ")
    .trim();

  const citationLine = `[${index}] ${faviconMarkdown} ${citationText}`.trim();

  return citationLine;
}

/**
 * collectUniqueSources
 *
 * Scans all stages and returns a de-duplicated array of Findings preserving
 * order of first appearance across stages & nodes.
 */
export function collectUniqueSources(stages: ReasoningStage[]): Finding[] {
  const seen = new Set<string>();
  const unique: Finding[] = [];

  for (const stage of stages) {
    if (!stage.reasoningTree) continue;
    for (const node of stage.reasoningTree.nodes) {
      for (const f of node.findings) {
        if (!seen.has(f.source)) {
          seen.add(f.source);
          unique.push(f);
        }
      }
    }
  }

  return unique;
}

/**
 * assignCitationNumbers
 *
 * Takes a list of unique findings (deduped) and returns a Map of
 * `url -> IEEE index` using order in the given list.
 */
export function assignCitationNumbers(
  findings: Finding[]
): Map<string, number> {
  const map = new Map<string, number>();
  findings.forEach((f, idx) => {
    map.set(f.source, idx + 1); // IEEE numbering starts at 1
  });
  return map;
}
