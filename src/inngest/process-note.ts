import { inngest } from "./client";
import { prisma } from "@/lib/prisma";
import { callClaude } from "@/lib/ai";
import { noteSummarizerPrompt } from "@/prompts/note-summarizer";
import { noteSummarySchema } from "@/lib/schemas";

export const processNote = inngest.createFunction(
  {
    id: "notes-process",
    retries: 2,
    triggers: [{ event: "notes/process" }],
  },
  async ({ event, step }) => {
    const { meetingId } = event.data as { meetingId: string };

    // Step 1: Content extraction (type-dependent)
    const transcript = await step.run("extract-content", async () => {
      const meeting = await prisma.meeting.findUniqueOrThrow({
        where: { id: meetingId },
      });

      if (meeting.type === "text_note") {
        await prisma.meeting.update({
          where: { id: meetingId },
          data: { transcript: meeting.textContent, status: "extracting" },
        });
        return meeting.textContent || "";
      }

      if (meeting.type === "handwritten") {
        const imageUrl = meeting.imageUrl;
        if (!imageUrl) throw new Error("No image URL for handwritten note");

        const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const client = new Anthropic();

        const fs = await import("fs/promises");
        const path = await import("path");
        const imagePath = path.join(process.cwd(), "public", imageUrl);
        const imageBuffer = await fs.readFile(imagePath);
        const base64 = imageBuffer.toString("base64");

        const ext = imageUrl.split(".").pop()?.toLowerCase() || "jpeg";
        const mediaType = ext === "png" ? "image/png" as const
          : ext === "webp" ? "image/webp" as const
          : ext === "gif" ? "image/gif" as const
          : "image/jpeg" as const;

        const response = await client.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 4096,
          messages: [{
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: base64 },
              },
              {
                type: "text",
                text: "Extract all text from this handwritten note. Return only the extracted text, preserving the original structure and line breaks. Do not add commentary.",
              },
            ],
          }],
        });

        const text = response.content[0].type === "text" ? response.content[0].text : "";
        await prisma.meeting.update({
          where: { id: meetingId },
          data: { transcript: text, status: "extracting" },
        });
        return text;
      }

      return meeting.transcript || "";
    });

    // Step 2: Summarize
    await step.run("summarize", async () => {
      if (!transcript.trim()) {
        await prisma.meeting.update({
          where: { id: meetingId },
          data: { summary: "No content to summarize.", status: "ready" },
        });
        return;
      }

      const meeting = await prisma.meeting.findUniqueOrThrow({ where: { id: meetingId } });
      const prompt = noteSummarizerPrompt(transcript);
      const raw = await callClaude({
        systemPrompt: prompt.system,
        userMessage: prompt.user,
        temperature: 0.1,
        projectId: meeting.projectId || undefined,
        action: "transcription",
      });

      let summary: string;
      try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON");
        const parsed = noteSummarySchema.parse(JSON.parse(jsonMatch[0]));
        summary = parsed.summary;
      } catch {
        summary = raw.slice(0, 2000);
      }

      await prisma.meeting.update({
        where: { id: meetingId },
        data: { summary },
      });
    });

    // Step 3: Trigger feature extraction (reuses existing pipeline)
    await step.run("trigger-extraction", async () => {
      await inngest.send({
        name: "meeting/extract-suggestions",
        data: { meetingId },
      });
    });

    return { meetingId };
  }
);
