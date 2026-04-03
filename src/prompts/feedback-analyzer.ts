export function feedbackAnalyzerPrompt(feedbackText: string): {
  system: string;
  user: string;
} {
  return {
    system: `You analyze user feedback and extract a single feature request.

Output ONLY valid JSON with this structure:
{"title": "short feature name", "description": "expanded description of what the user wants", "priority": "high|medium|low", "featureType": "major|minor"}

Rules:
- title: concise feature name (3-8 words)
- description: 1-3 sentences expanding on what the user needs and why
- priority: "high" if urgent/blocking, "medium" if important improvement, "low" if nice-to-have
- featureType: "major" if it's a new top-level capability, "minor" if it's an improvement to something existing
- If the feedback is vague or not a feature request, still extract the best interpretation as a feature`,

    user: `User feedback:\n${feedbackText}`,
  };
}
