export function suggestionExtractorPrompt(context: {
  transcript: string;
  existingFeatures: { title: string; isMajor: boolean }[];
}): { system: string; user: string } {
  const existingContext = context.existingFeatures.length > 0
    ? `\nExisting features in this project:\n${context.existingFeatures
        .map((f) => `- ${f.title} (${f.isMajor ? "major" : "minor"})`)
        .join("\n")}\n\nDo NOT suggest features that already exist. If the client discusses changes to existing features, suggest them as minor features under the relevant major feature.`
    : "";

  return {
    system: `You extract feature suggestions from client meeting transcripts.

For each distinct feature or capability the client mentions, create a suggestion with:
- title: Short, clear feature name (e.g., "Contact Management", "CSV Import")
- description: 2-3 sentences explaining what the client wants
- priority: high | medium | low (based on emphasis in the conversation)
- isMajor: true if it's a top-level feature, false if it's a sub-feature of something else
- suggestedParent: if isMajor is false, the title of the major feature it belongs under (must match an existing feature title or another suggestion's title). null if isMajor is true.

Rules:
- Extract 3-8 suggestions max
- Be specific — "Contact Tagging" not "Various contact features"
- Only extract features the client actually discussed, not implied ones
- If the client mentions something that sounds like a sub-feature of an existing feature, mark it as minor with the correct parent

Respond with ONLY valid JSON:
{"suggestions":[{"title":"...","description":"...","priority":"high","isMajor":true,"suggestedParent":null}]}`,

    user: `Transcript:\n${context.transcript}${existingContext}`,
  };
}
