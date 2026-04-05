import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";

const client = new Anthropic();

// Pricing per million tokens (as of 2025)
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-opus-4-6": { input: 15.0, output: 75.0 },
  "claude-haiku-4-5-20251001": { input: 0.80, output: 4.0 },
};

function calculateCostCents(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = PRICING[model] || PRICING["claude-sonnet-4-6"];
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return Math.round((inputCost + outputCost) * 100 * 100) / 100; // cents, 2 decimal places
}

export async function callClaude({
  systemPrompt,
  userMessage,
  temperature = 0,
  maxTokens = 16384,
  projectId,
  action,
  featureId,
}: {
  systemPrompt: string;
  userMessage: string;
  temperature?: number;
  maxTokens?: number;
  projectId?: string;
  action?: string;
  featureId?: string;
}): Promise<string> {
  const model = "claude-sonnet-4-6";
  const stream = client.messages.stream({
    model,
    max_tokens: maxTokens,
    temperature,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const response = await stream.finalMessage();
  const block = response.content[0];
  if (block.type !== "text") throw new Error("Unexpected response type");

  // Log cost if projectId provided
  if (projectId && action) {
    const inputTokens = response.usage?.input_tokens || 0;
    const outputTokens = response.usage?.output_tokens || 0;
    const costCents = calculateCostCents(model, inputTokens, outputTokens);

    prisma.costEntry.create({
      data: {
        projectId,
        action,
        model,
        inputTokens,
        outputTokens,
        costCents,
        featureId: featureId || null,
      },
    }).catch(() => {}); // fire and forget
  }

  return block.text;
}
