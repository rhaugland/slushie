import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { transcribe } from "@/inngest/transcribe";
import { extractObjectives } from "@/inngest/extract-objectives";
import { architect } from "@/inngest/architect";
import { build } from "@/inngest/build";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [transcribe, extractObjectives, architect, build],
});
