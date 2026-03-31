import { inngest } from "./client";
import { prisma } from "@/lib/prisma";
import { DeepgramClient, type ListenV1Response } from "@deepgram/sdk";

export const transcribe = inngest.createFunction(
  {
    id: "meeting-transcribe",
    retries: 3,
    triggers: [{ event: "meeting/transcribe" }],
  },
  async ({ event, step }) => {
    const { meetingId } = event.data;

    const meeting = await step.run("load-meeting", async () => {
      return prisma.meeting.findUniqueOrThrow({ where: { id: meetingId } });
    });

    const transcript = await step.run("transcribe-audio", async () => {
      const deepgram = new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY! });
      const response = await deepgram.listen.v1.media.transcribeUrl(
        { url: meeting.audioUrl, model: "nova-3", smart_format: true }
      );
      const listenResponse = response as ListenV1Response;
      return listenResponse?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
    });

    await step.run("save-transcript", async () => {
      await prisma.meeting.update({
        where: { id: meetingId },
        data: { transcript, status: "extracting" },
      });
    });

    await step.run("trigger-extraction", async () => {
      await inngest.send({
        name: "meeting/extract-objectives",
        data: { meetingId },
      });
    });

    return { meetingId, transcriptLength: transcript.length };
  }
);
