import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  // Redirect to the catch-all route handler with an empty path
  // This ensures consistent handling
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { port: true, deployStatus: true },
  });

  if (!project?.port || project.deployStatus !== "running") {
    return NextResponse.json({ error: "Preview not running" }, { status: 503 });
  }

  try {
    const upstream = await fetch(`http://localhost:${project.port}/`, {
      headers: { "Accept": req.headers.get("accept") || "*/*" },
      redirect: "manual",
    });

    if (upstream.status >= 300 && upstream.status < 400) {
      const location = upstream.headers.get("location");
      if (location) {
        let proxied = location.replace(`http://localhost:${project.port}`, "");
        if (proxied.startsWith("/")) {
          const sep = proxied.includes("?") ? "&" : "?";
          return NextResponse.redirect(
            new URL(`/api/preview${proxied}${sep}projectId=${projectId}`, req.url),
            upstream.status as 301 | 302 | 303 | 307 | 308
          );
        }
      }
    }

    const contentType = upstream.headers.get("content-type") || "text/html";
    const body = await upstream.arrayBuffer();

    return new NextResponse(body, {
      status: upstream.status,
      headers: { "Content-Type": contentType },
    });
  } catch {
    return NextResponse.json({ error: "Preview server unreachable" }, { status: 502 });
  }
}
