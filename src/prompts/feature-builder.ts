export function featureBuilderPrompt(context: {
  title: string;
  description: string;
  existingTables: string;
  siblingFeatures: { title: string; tables: string }[];
  themeVars: string;
}): { system: string; user: string } {
  const siblingContext = context.siblingFeatures.length > 0
    ? `\nOther enabled features (for shared DB context, do NOT import their code):\n${context.siblingFeatures
        .map((f) => `- ${f.title}: tables: ${f.tables}`)
        .join("\n")}`
    : "";

  return {
    system: `You are a feature module builder. You generate self-contained Next.js feature modules.

Each module is a directory that gets placed at /features/{featureId}/ in a Next.js app.

REQUIRED files:
- page.tsx — the main page component (default export, "use client" if interactive)
- schema.sql — SQLite CREATE TABLE IF NOT EXISTS statements for any data this feature needs

OPTIONAL files:
- components/*.tsx — sub-components
- api/route.ts — API routes (will be mounted at /api/features/{featureId}/*)

Rules:
- Use "use client" directive for interactive components
- Import shared UI from @/components/ui (Button, Card, Input, Table/Thead/Th/Td, Modal)
- For database access, import { getDb } from "@/lib/db"
- Use CSS variables for theme colors: var(--color-primary), var(--color-text), var(--color-surface), etc.
- NEVER import from other feature modules
- You CAN read other features' database tables directly via SQL
- Use Tailwind CSS classes for styling
- Keep it compact — working MVP only
- All SQL must use CREATE TABLE IF NOT EXISTS and ALTER TABLE ADD COLUMN IF NOT EXISTS patterns

Respond with ONLY valid JSON (no markdown, no explanation):
{"files":[{"path":"page.tsx","content":"..."},{"path":"schema.sql","content":"..."}]}`,

    user: `Feature: ${context.title}
Description: ${context.description}

Current database schema:
${context.existingTables || "No tables yet."}
${siblingContext}

Build this feature module.`,
  };
}
