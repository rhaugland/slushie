export function noteSummarizerPrompt(transcript: string): {
  system: string;
  user: string;
} {
  return {
    system: `You summarize meeting transcripts and notes into concise, actionable summaries.

Output ONLY valid JSON with this structure:
{"summary": "3-8 bullet points as a single string, each bullet on its own line starting with •"}

Rules:
- Focus on decisions, action items, and feature requests
- Keep each bullet to one sentence
- Use present tense for decisions ("Team will..." → "Ship new dashboard")
- Omit small talk, greetings, and off-topic discussion
- If the text is very short or has no actionable content, summarize what was discussed in 1-2 bullets`,

    user: `Transcript/Notes:\n${transcript}`,
  };
}
