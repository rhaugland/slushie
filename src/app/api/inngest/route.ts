import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { transcribe } from "@/inngest/transcribe";
import { extractSuggestions } from "@/inngest/extract-suggestions";
import { createProject } from "@/inngest/create-project";
import { buildFeature } from "@/inngest/build-feature";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [transcribe, extractSuggestions, createProject, buildFeature],
});
