import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { transcribe } from "@/inngest/transcribe";
import { extractSuggestions } from "@/inngest/extract-suggestions";
import { createProject } from "@/inngest/create-project";
import { buildFeature } from "@/inngest/build-feature";
import { deployCodebase } from "@/inngest/deploy-codebase";
import { buildWithClaudeCode } from "@/inngest/build-with-claude-code";
import { processNote } from "@/inngest/process-note";
import { analyzeFeedback } from "@/inngest/analyze-feedback";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [transcribe, extractSuggestions, createProject, buildFeature, deployCodebase, buildWithClaudeCode, processNote, analyzeFeedback],
});
