import { NextRequest, NextResponse } from "next/server";
import { callClaude } from "@/lib/ai";
import { codebaseAnalyzerPrompt } from "@/prompts/codebase-analyzer";
import AdmZip from "adm-zip";
import { readFile } from "fs/promises";
import path from "path";

const SKIP_DIRS = [
  "node_modules", ".next", ".git", "dist", "build", ".cache",
  "__pycache__", ".venv", "venv", "vendor", ".idea", ".vscode",
];

const SOURCE_EXTENSIONS = [
  ".ts", ".tsx", ".js", ".jsx", ".py", ".rb", ".go", ".rs",
  ".vue", ".svelte", ".css", ".scss", ".html", ".sql", ".prisma",
  ".json", ".yaml", ".yml", ".toml", ".md",
];

const MAX_FILE_SIZE = 10000; // chars per file
const MAX_TOTAL_CHARS = 80000; // total content sent to Claude

function shouldInclude(filePath: string): boolean {
  const parts = filePath.split("/");
  if (parts.some((p) => SKIP_DIRS.includes(p))) return false;
  if (parts.some((p) => p.startsWith("."))) return false;
  const ext = path.extname(filePath).toLowerCase();
  return SOURCE_EXTENSIONS.includes(ext);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await params; // validate route param exists

  const body = await req.json();
  const { fileUrl } = body;

  if (!fileUrl) {
    return NextResponse.json({ error: "fileUrl required" }, { status: 400 });
  }

  // Read the uploaded zip file
  const filePath = path.join(process.cwd(), "public", fileUrl);
  let zipBuffer: Buffer;
  try {
    zipBuffer = await readFile(filePath);
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  // Extract zip entries
  let zip: AdmZip;
  try {
    zip = new AdmZip(zipBuffer);
  } catch {
    return NextResponse.json({ error: "Invalid zip file" }, { status: 400 });
  }

  const entries = zip.getEntries();
  const allPaths: string[] = [];
  const fileSamples: { path: string; content: string }[] = [];
  let totalChars = 0;

  for (const entry of entries) {
    if (entry.isDirectory) continue;

    const entryPath = entry.entryName;
    allPaths.push(entryPath);

    if (!shouldInclude(entryPath)) continue;

    const content = entry.getData().toString("utf-8");
    if (content.length === 0) continue;

    const truncated = content.length > MAX_FILE_SIZE
      ? content.substring(0, MAX_FILE_SIZE) + "\n... (truncated)"
      : content;

    if (totalChars + truncated.length > MAX_TOTAL_CHARS) continue;

    fileSamples.push({ path: entryPath, content: truncated });
    totalChars += truncated.length;
  }

  // Build file tree string
  const fileTree = allPaths
    .filter((p) => {
      const parts = p.split("/");
      return !parts.some((part) => SKIP_DIRS.includes(part));
    })
    .sort()
    .join("\n");

  // Call Claude to analyze
  const prompt = codebaseAnalyzerPrompt({ fileTree, fileSamples });

  const raw = await callClaude({
    systemPrompt: prompt.system,
    userMessage: prompt.user,
    temperature: 0.1,
    maxTokens: 16000,
  });

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }

  try {
    const analysis = JSON.parse(jsonMatch[0]);
    return NextResponse.json(analysis);
  } catch {
    return NextResponse.json({ error: "Failed to parse analysis" }, { status: 500 });
  }
}
