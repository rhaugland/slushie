import { inngest } from "./client";
import { prisma } from "@/lib/prisma";
import { DeepgramClient } from "@deepgram/sdk";
import { readFile } from "fs/promises";
import path from "path";
import { callClaude } from "@/lib/ai";
import { noteSummarizerPrompt } from "@/prompts/note-summarizer";
import { noteSummarySchema } from "@/lib/schemas";

const deepgram = new DeepgramClient(process.env.DEEPGRAM_API_KEY! as any);

export const transcribe = inngest.createFunction(
  {
    id: "meeting-transcribe",
    retries: 3,
    triggers: [{ event: "meeting/transcribe" }],
  },
  async ({ event, step }) => {
    const { meetingId } = event.data;

    const meeting = await step.run("load-meeting", async () => {
      const m = await prisma.meeting.update({
        where: { id: meetingId },
        data: { status: "transcribing" },
      });
      return m;
    });

    const transcript = await step.run("transcribe", async () => {
      const audioUrl = meeting.audioUrl;
      let response;

      if (audioUrl.startsWith("/uploads/")) {
        const filePath = path.join(process.cwd(), "public", audioUrl);
        const buffer = await readFile(filePath);
        response = await (deepgram as any).listen.prerecorded.transcribeFile(
          buffer,
          { model: "nova-3", smart_format: true }
        );
      } else {
        response = await (deepgram as any).listen.prerecorded.transcribeUrl(
          { url: audioUrl },
          { model: "nova-3", smart_format: true }
        );
      }

      const text =
        response.result?.results?.channels?.[0]?.alternatives?.[0]?.transcript ??
        "";
      return text;
    });

    await step.run("save-transcript", async () => {
      await prisma.meeting.update({
        where: { id: meetingId },
        data: { transcript, status: "extracting" },
      });
    });

    await step.run("summarize", async () => {
      if (!transcript.trim()) return;
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

    await step.run("trigger-extraction", async () => {
      await inngest.send({
        name: "meeting/extract-suggestions",
        data: { meetingId },
      });
    });

    return { meetingId };
  }
);
