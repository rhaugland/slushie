import { prisma } from "@/lib/prisma";
import { callClaude } from "@/lib/ai";

export async function classifyWishlistItem(wishlistItemId: string): Promise<void> {
  const item = await prisma.wishlistItem.findUnique({
    where: { id: wishlistItemId },
    include: {
      project: {
        include: {
          features: {
            where: { parentId: null },
            select: { id: true, title: true, description: true },
          },
        },
      },
    },
  });

  if (!item) return;

  const majorFeatures = item.project?.features || [];
  const majorList = majorFeatures.length > 0
    ? majorFeatures.map((f) => `- "${f.title}": ${f.description.slice(0, 100)}`).join("\n")
    : "(No major features exist yet)";

  const text = await callClaude({
    systemPrompt: "You classify feature requests. Respond with JSON only.",
    userMessage: `Classify this feature request as "major" (new top-level capability) or "minor" (improvement to an existing feature).

Feature: "${item.title}"
Description: "${item.description}"

Existing major features in this project:
${majorList}

Respond with JSON only: {"featureType": "major" or "minor", "suggestedParent": "exact title of parent feature or null"}
If major, suggestedParent must be null. If minor, suggestedParent should be the exact title of the most relevant existing major feature, or null if none fit.`,
    temperature: 0.1,
    maxTokens: 200,
  });

  let featureType = "major";
  let suggestedParent: string | null = null;

  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      featureType = parsed.featureType === "minor" ? "minor" : "major";
      suggestedParent = parsed.suggestedParent || null;
    }
  } catch {
    // default to major if parsing fails
  }

  await prisma.wishlistItem.update({
    where: { id: wishlistItemId },
    data: { featureType, suggestedParent },
  });
}
