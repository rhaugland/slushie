import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { transcribe } from "@/inngest/transcribe";
import { extractObjectives } from "@/inngest/extract-objectives";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [transcribe, extractObjectives],
});
