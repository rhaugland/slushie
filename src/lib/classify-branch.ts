import { callClaude } from "@/lib/ai";

export interface ClassificationResult {
  type: "major" | "minor";
  parentFeatureId: string | null;
  title: string;
  description: string;
  confidence: number;
}

const SYSTEM_PROMPT = `You are a software architect classifying a GitHub branch into a project's feature tree.

You will receive:
1. The branch name
2. The files changed on this branch (paths only)
3. The existing feature tree (major features and their minor sub-features)

Your job: Decide if this branch represents a NEW major feature, or a MINOR feature that belongs under an existing major feature.

Rules:
- A MAJOR feature is a large, independent area of functionality (e.g., "Authentication", "Dashboard", "Contact Management")
- A MINOR feature is a specific piece within a major feature (e.g., "Login Page" under "Authentication", "Export Contacts" under "Contact Management")
- If the branch clearly relates to an existing major feature, classify it as MINOR under that feature
- If it doesn't fit under any existing feature, classify it as MAJOR
- Generate a clean, human-readable title (not the branch name)
- Write a one-sentence description of what this feature likely does based on the branch name and files

Respond with ONLY valid JSON (no markdown, no code fences):
{
  "type": "major" or "minor",
  "parentFeatureId": "id of parent if minor, null if major",
  "title": "Human-readable feature title",
  "description": "One-sentence description",
  "confidence": 0.0-1.0
}`;

export async function classifyBranch(
  branchName: string,
  changedFiles: string[],
  existingFeatures: { id: string; title: string; description: string; children: { id: string; title: string }[] }[],
  projectId: string
): Promise<ClassificationResult> {
  const featureTree = existingFeatures.map((f) => ({
    id: f.id,
    title: f.title,
    description: f.description,
    children: f.children.map((c) => ({ id: c.id, title: c.title })),
  }));

  const userMessage = `Branch: ${branchName}

Changed files:
${changedFiles.slice(0, 50).map((f) => `- ${f}`).join("\n")}
${changedFiles.length > 50 ? `\n... and ${changedFiles.length - 50} more files` : ""}

Existing feature tree:
${JSON.stringify(featureTree, null, 2)}`;

  try {
    const response = await callClaude({
      systemPrompt: SYSTEM_PROMPT,
      userMessage,
      temperature: 0,
      maxTokens: 512,
      projectId,
      action: "branch_classification",
    });

    const parsed = JSON.parse(response.trim());

    // Validate parentFeatureId exists if minor
    if (parsed.type === "minor" && parsed.parentFeatureId) {
      const parentExists = existingFeatures.some((f) => f.id === parsed.parentFeatureId);
      if (!parentExists) {
        // AI hallucinated a parent ID — fall back to major
        parsed.type = "major";
        parsed.parentFeatureId = null;
      }
    }

    return {
      type: parsed.type === "minor" ? "minor" : "major",
      parentFeatureId: parsed.parentFeatureId || null,
      title: parsed.title || branchName,
      description: parsed.description || `From branch: ${branchName}`,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    };
  } catch {
    // Fallback: treat as major feature with branch-derived title
    return {
      type: "major",
      parentFeatureId: null,
      title: branchName
        .replace(/^feature\//, "")
        .replace(/^fix\//, "Fix: ")
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase()),
      description: `Synced from GitHub branch: ${branchName}`,
      confidence: 0,
    };
  }
}
