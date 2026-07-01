import type { ImageRole } from "./rubric";

export type EnhancementAction = "edit" | "keep";

export interface ImageEnhancement {
  imageIndex: number;
  action: EnhancementAction;
  imageRole: ImageRole;
  goal: string;
  issuesAddressed: string[];
  editInstruction: string;
  copy: string[];
}

export interface NewImageSpec {
  imageRole: ImageRole;
  purpose: string;
  referenceImageIndex: number;
  generationPrompt: string;
  copy: string[];
}

export interface EnhancementPlan {
  planSummary: string;
  imageEnhancements: ImageEnhancement[];
  newImages: NewImageSpec[];
}

export interface EnhanceResponse extends EnhancementPlan {
  generationAvailable: boolean;
}

export type GenerationStatus = "pending" | "generating" | "done" | "error" | "kept";

export interface GeneratedImage {
  base64: string;
  mediaType: string;
}
