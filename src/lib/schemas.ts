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

export const noteSummarySchema = z.object({
  summary: z.string(),
});

export const feedbackAnalysisSchema = z.object({
  title: z.string(),
  description: z.string(),
  priority: z.enum(["high", "medium", "low"]),
  featureType: z.enum(["major", "minor"]),
});

export type FeatureModuleOutput = z.infer<typeof featureModuleSchema>;
export type MeetingSuggestionsOutput = z.infer<typeof meetingSuggestionsSchema>;
export type NoteSummaryOutput = z.infer<typeof noteSummarySchema>;
export type FeedbackAnalysisOutput = z.infer<typeof feedbackAnalysisSchema>;
