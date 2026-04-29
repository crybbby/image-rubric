export type ImageRole = "hero" | "lifestyle" | "infographic" | "detail" | "unknown";
export type Severity = "critical" | "major" | "minor";

export interface RubricIssue {
  severity: Severity;
  category: string;
  description: string;
  fix: string;
}

export interface ImageAnalysis {
  imageIndex: number;
  imageRole: ImageRole;
  strengths: string[];
  issues: RubricIssue[];
  score: number;
}

export interface SetLevelFeedback {
  strengths: string[];
  gaps: string[];
  priorityFixes: string[];
}

export interface RubricResult {
  overallScore: number;
  overallVerdict: string;
  imageAnalysis: ImageAnalysis[];
  setLevelFeedback: SetLevelFeedback;
}
