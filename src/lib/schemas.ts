import { z } from "zod";

export const objectiveSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  priority: z.enum(["high", "medium", "low"]),
});

export const objectivesResponseSchema = z.object({
  objectives: z.array(objectiveSchema).min(1),
});

export const architectPlanSchema = z.object({
  summary: z.string().min(1),
  features: z.array(z.string()),
  techStack: z.object({
    framework: z.string(),
    styling: z.string(),
    other: z.array(z.string()),
  }),
  fileStructure: z.array(z.string()),
  implementationSteps: z.array(z.string()),
});

export const buildOutputSchema = z.object({
  files: z.array(
    z.object({
      path: z.string().min(1),
      content: z.string().min(1),
    })
  ),
});
