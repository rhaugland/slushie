import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export async function callClaude({
  systemPrompt,
  userMessage,
  temperature = 0,
}: {
  systemPrompt: string;
  userMessage: string;
  temperature?: number;
}): Promise<string> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    temperature,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const block = response.content[0];
  if (block.type !== "text") throw new Error("Unexpected response type");
  return block.text;
}
