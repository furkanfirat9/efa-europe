import { PreFilledAttribute } from './filler';

export interface TokenUsageStats {
  promptTokens: number;
  candidatesTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  model: string;
}

/**
 * Resmi Google Gemini 3.8 Flash Fiyatlandırma Tarifesi:
 * - Input (Prompt <= 200K): $0.75 / 1,000,000 tokens
 * - Output (Response + Reasoning/Thinking): $3.75 / 1,000,000 tokens
 */
export function calculateGemini38Cost(promptTokens: number, candidatesTokens: number): number {
  const promptCost = (promptTokens / 1_000_000) * 0.75;
  const candidatesCost = (candidatesTokens / 1_000_000) * 3.75;
  return promptCost + candidatesCost;
}

export const calculateGemini37Cost = calculateGemini38Cost;

export interface CategoryMatchResult {
  brand?: string;
  modelNo?: string;
  russianSeoTitle?: string;
  suggestedCategories: Array<{
    categoryId: number;
    categoryName: string;
    typeId: number;
    typeName: string;
    path: string[];
    confidence: number;
    reason: string;
  }>;
  usage?: TokenUsageStats;
}

export interface DeepCategoryResearchResult {
  brand?: string;
  modelNo?: string;
  russianSeoTitle?: string;
  turkishTitle?: string;
  barcode?: string;
  isBarcodeGenerated?: boolean;
  dimensions?: {
    widthMm: number;
    heightMm: number;
    depthMm: number;
  };
  weightG?: number;
  summaryBullets?: string[];
  researchSummaryBullets?: string[];
  attributes: PreFilledAttribute[];
  usage?: TokenUsageStats;
}

