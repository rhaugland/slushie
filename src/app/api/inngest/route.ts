import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { transcribe } from "@/inngest/transcribe";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [transcribe],
});
