export interface Finding {
  source: string;
  content: string;
  relevanceScore?: number;
  analysis?: string;
}

export interface ReasoningNode {
  id: string;
  parentId: string | null;
  depth: number;
  query: string;
  reasoning: string;
  findings: Finding[];
  reflection?: string;
  relevanceScore?: number;
  children: string[];
}

export interface ResearchStage {
  id: number;
  name: string;
  description: string;
  completed: boolean;
  content?: string;
  reasoningTree?: {
    nodes: ReasoningNode[];
  };
  analysis?: string;
  reasoningComplete?: boolean;
  analysisComplete?: boolean;
}

export interface ResearchUpdate {
  type: string;
  eventType?: "progress" | "complete" | "error";
  message: string;
  timestamp?: string;
  stage?: {
    index: number;
    name: string;
    description: string;
    totalStages?: number;
    reasoningTree?: {
      nodes: ReasoningNode[];
    };
  };
  agent?: string;
  progress?: {
    percent: number;
    currentStep?: string;
    totalSteps?: number;
  };
  tree?: {
    nodeCount?: number;
    maxDepth?: number;
    nodesWithFindings?: number;
  };
  analysis?: string;
  findings?: Finding[];
  stages?: Array<{
    id: number;
    name: string;
    description: string;
    analysis?: string;
    reasoningComplete?: boolean;
    analysisComplete?: boolean;
    reasoningTree?: {
      nodes: ReasoningNode[];
    };
  }>;
  completed?: boolean;
}
