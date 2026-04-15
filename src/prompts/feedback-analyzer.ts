export function feedbackAnalyzerPrompt(feedbackText: string): {
  system: string;
  user: string;
} {
  return {
    system: `You analyze user feedback and suggest a concrete feature to build.

Output ONLY valid JSON with this structure:
{"title": "short feature name", "description": "what to build and how it solves the user's problem", "priority": "high|medium|low", "featureType": "major|minor"}

Rules:
- title: actionable feature name (3-8 words), e.g. "Bulk Contact Import via CSV" not "Import Issue"
- description: 1-3 sentences describing the specific feature to build, what it does for the user, and how it addresses their feedback. Be concrete — suggest a solution, not just a restatement of the problem.
- priority: "high" if urgent/blocking, "medium" if important improvement, "low" if nice-to-have
- featureType: "major" if it's a new top-level capability, "minor" if it's an improvement to something existing
- Always suggest a buildable feature, even if the feedback is vague — interpret it as the most useful thing to build`,

    user: `User feedback:\n${feedbackText}`,
  };
}
