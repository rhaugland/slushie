import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export async function callClaude({
  systemPrompt,
  userMessage,
  temperature = 0,
  maxTokens = 16384,
}: {
  systemPrompt: string;
  userMessage: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const stream = client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: maxTokens,
    temperature,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const response = await stream.finalMessage();
  const block = response.content[0];
  if (block.type !== "text") throw new Error("Unexpected response type");
  return block.text;
}
