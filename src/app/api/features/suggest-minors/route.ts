import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser as getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, description, projectName, projectId } = await req.json();

  if (!title || !description) {
    return NextResponse.json({ error: "title and description required" }, { status: 400 });
  }

  // Get existing routes to help AI understand the app's routing structure
  let existingRoutes: string[] = [];
  if (projectId) {
    const features = await prisma.feature.findMany({
      where: { projectId, route: { not: null } },
      select: { route: true },
    });
    existingRoutes = features.map(f => f.route).filter((r): r is string => r !== null);
  }

  const routeContext = existingRoutes.length > 0
    ? `\n\nExisting routes in the app: ${existingRoutes.join(", ")}\nNew routes MUST follow the same prefix pattern as existing routes (e.g. if existing routes start with /admin/, new routes must also start with /admin/).`
    : "";

  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `You are helping plan features for a web application called "${projectName || "the app"}".

A major feature section is being created:
Title: "${title}"
Description: "${description}"${routeContext}

Suggest 3-6 minor features (sub-features) that should exist within this section. Each should be a discrete, buildable UI component or page element.

Respond ONLY with valid JSON — no markdown, no code fences, no explanation. The format:
[
  { "title": "Feature Name", "description": "One sentence describing what this builds", "route": "/suggested/route" }
]

Keep titles short (2-4 words). Descriptions should be specific and actionable. Routes must follow the existing route patterns.`,
      },
    ],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";

  try {
    const suggestions = JSON.parse(text.trim());
    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ error: "Failed to parse suggestions", raw: text }, { status: 500 });
  }
}
