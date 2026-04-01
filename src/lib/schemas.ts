import { z } from "zod";

export const featureModuleSchema = z.object({
  files: z.array(
    z.object({
      path: z.string(),
      content: z.string(),
    })
  ),
});

export const meetingSuggestionsSchema = z.object({
  suggestions: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      priority: z.enum(["high", "medium", "low"]),
      isMajor: z.boolean(),
      suggestedParent: z.string().nullable(),
    })
  ),
});

export type FeatureModuleOutput = z.infer<typeof featureModuleSchema>;
export type MeetingSuggestionsOutput = z.infer<typeof meetingSuggestionsSchema>;
