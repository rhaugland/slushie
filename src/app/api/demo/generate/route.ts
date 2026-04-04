import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { callClaude } from "@/lib/ai";
import { classifyWishlistItem } from "@/lib/classify-wishlist";
import { readdir, readFile, stat } from "fs/promises";
import { join } from "path";

const MAX_CONTEXT_CHARS = 40000;

async function scanCodebase(): Promise<string> {
  const root = process.cwd();
  const srcDir = join(root, "src");
  const parts: string[] = [];
  let charCount = 0;

  // Collect key files that represent the app's architecture
  const priorityPaths = [
    "src/app/page.tsx",
    "src/app/layout.tsx",
    "prisma/schema.prisma",
  ];

  // Read priority files first
  for (const relPath of priorityPaths) {
    try {
      const content = await readFile(join(root, relPath), "utf-8");
      const snippet = content.slice(0, 3000);
      parts.push(`=== ${relPath} ===\n${snippet}`);
      charCount += snippet.length + relPath.length + 10;
    } catch {}
  }

  // Then scan components and API routes for signatures
  async function scanDir(dir: string, prefix: string) {
    if (charCount > MAX_CONTEXT_CHARS) return;
    try {
      const entries = await readdir(dir);
      for (const entry of entries.sort()) {
        if (charCount > MAX_CONTEXT_CHARS) break;
        const full = join(dir, entry);
        const rel = join(prefix, entry);
        const s = await stat(full);
        if (s.isDirectory()) {
          await scanDir(full, rel);
        } else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) {
          try {
            const content = await readFile(full, "utf-8");
            // For components, grab first 80 lines; for API routes, grab first 60
            const lines = content.split("\n");
            const limit = rel.includes("components") ? 80 : 60;
            const snippet = lines.slice(0, limit).join("\n");
            parts.push(`=== ${rel} ===\n${snippet}`);
            charCount += snippet.length + rel.length + 10;
          } catch {}
        }
      }
    } catch {}
  }

  await scanDir(join(srcDir, "components"), "src/components");
  await scanDir(join(srcDir, "app", "api"), "src/app/api");
  await scanDir(join(srcDir, "lib"), "src/lib");
  await scanDir(join(srcDir, "inngest"), "src/inngest");

  return parts.join("\n\n");
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, type } = await req.json();
  if (!projectId || !type) {
    return NextResponse.json({ error: "projectId and type required" }, { status: 400 });
  }

  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      client: true,
      features: { where: { parentId: null }, select: { title: true, description: true } },
    },
  });

  const codebaseContext = await scanCodebase();

  const featureContext = project.features
    .map((f) => `- ${f.title}: ${f.description?.slice(0, 100) || "No description"}`)
    .join("\n");

  const projectContext = `This is a real codebase called "slushie.machine" — an AI-powered project management and feature delivery platform built with Next.js, Prisma, TailwindCSS, and Inngest.

Existing features already built:
${featureContext || "None yet"}

Here is the actual source code of the application:

${codebaseContext}`;

  if (type === "notes") {
    return generateNotes(projectContext, project, user);
  } else if (type === "wishlist") {
    return generateWishlist(projectContext, project, user);
  } else if (type === "feedback") {
    return generateFeedback(projectContext, project);
  }

  return NextResponse.json({ error: "Invalid type. Must be notes, wishlist, or feedback" }, { status: 400 });
}

async function generateNotes(
  projectContext: string,
  project: { id: string; clientId: string; workspaceId: string },
  user: any
) {
  const raw = await callClaude({
    systemPrompt: `You are a senior engineer who has reviewed this codebase thoroughly. Generate realistic meeting notes that discuss actual improvements, bugs, and features that would genuinely improve this application based on the real code you see. These should be actionable — things the developer would actually want to build. Return valid JSON only, no markdown fences.`,
    userMessage: `${projectContext}

Generate 3 meeting notes as if the team just reviewed this codebase. Each should discuss real issues, improvements, or features based on what you see in the actual code. Reference specific components, pages, or patterns you notice. Topics could include:
- UX improvements based on actual component code
- Missing error handling or edge cases you spotted
- Performance optimizations
- New features that would complement what already exists
- Architecture improvements

Return JSON array:
[
  {
    "textContent": "Full meeting note (2-3 paragraphs, referencing real parts of the codebase)",
    "summary": "1-2 sentence summary"
  }
]`,
    temperature: 0.7,
  });

  const notes = JSON.parse(raw);

  const created = [];
  for (const note of notes) {
    const meeting = await prisma.meeting.create({
      data: {
        projectId: project.id,
        clientId: project.clientId,
        type: "text_note",
        textContent: note.textContent,
        summary: note.summary,
        status: "ready",
      },
    });
    created.push(meeting);
  }

  return NextResponse.json({ created: created.length, type: "notes" });
}

async function generateWishlist(
  projectContext: string,
  project: { id: string; clientId: string; workspaceId: string },
  user: any
) {
  const raw = await callClaude({
    systemPrompt: `You are a senior engineer and product manager who has reviewed this codebase thoroughly. Generate wishlist items for real features and improvements that would genuinely make this application better, based on the actual code. These should be things the developer would actually want to build. Return valid JSON only, no markdown fences.`,
    userMessage: `${projectContext}

Generate 5 wishlist items based on real gaps, improvements, or new features you identify from the actual codebase. Each should be specific and actionable — not generic. Reference what exists and what's missing. Mix priorities.

Return JSON array:
[
  {
    "title": "Specific feature title",
    "description": "Why this matters, what it would do, and roughly where in the codebase it would fit",
    "priority": "high" | "medium" | "low",
    "source": "manual"
  }
]`,
    temperature: 0.7,
  });

  const items = JSON.parse(raw);

  const created = [];
  for (const item of items) {
    const wishlistItem = await prisma.wishlistItem.create({
      data: {
        title: item.title,
        description: item.description,
        priority: item.priority,
        source: item.source || "manual",
        clientId: project.clientId,
        projectId: project.id,
      },
    });
    created.push(wishlistItem);

    // Auto-classify each item
    classifyWishlistItem(wishlistItem.id).catch(() => {});
  }

  return NextResponse.json({ created: created.length, type: "wishlist" });
}

async function generateFeedback(
  projectContext: string,
  project: { id: string; clientId: string; workspaceId: string }
) {
  const raw = await callClaude({
    systemPrompt: `You are a power user beta testing this application. Generate realistic feedback based on what you see in the actual codebase — things a real user would notice, complain about, or request. Be specific about UI/UX issues, missing functionality, or rough edges you can identify from the code. Return valid JSON only, no markdown fences.`,
    userMessage: `${projectContext}

Generate 4 feedback items as if you're a real user of this application. Based on the actual code, identify:
- UX pain points (things that look clunky or confusing in the component code)
- Missing features a user would expect
- Bugs or edge cases you can spot from the code
- Something that works well but could be even better

Write in first person, natural language — like a real user would write.

Return JSON array:
[
  {
    "text": "Raw user feedback (1-3 sentences, natural first-person language)",
    "title": "Short title",
    "description": "Detailed analysis of what the user is asking for and why it matters",
    "priority": "high" | "medium" | "low"
  }
]`,
    temperature: 0.7,
  });

  const items = JSON.parse(raw);

  const created = [];
  for (const item of items) {
    const feedbackItem = await prisma.feedbackItem.create({
      data: {
        projectId: project.id,
        text: item.text,
        title: item.title,
        description: item.description,
        priority: item.priority,
        status: "reviewed",
      },
    });
    created.push(feedbackItem);
  }

  return NextResponse.json({ created: created.length, type: "feedback" });
}
