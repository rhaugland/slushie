import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { port: true, deployStatus: true },
  });

  if (!project?.port || project.deployStatus !== "running") {
    return NextResponse.json({ error: "Preview not running" }, { status: 503 });
  }

  const targetUrl = `http://localhost:${project.port}/`;

  try {
    const upstream = await fetch(targetUrl, {
      headers: {
        "Accept": req.headers.get("accept") || "*/*",
      },
      redirect: "manual",
    });

    if (upstream.status >= 300 && upstream.status < 400) {
      const location = upstream.headers.get("location");
      if (location) {
        const proxied = location.replace(
          `http://localhost:${project.port}`,
          `/api/preview`
        );
        const separator = proxied.includes("?") ? "&" : "?";
        return NextResponse.redirect(
          new URL(`${proxied}${separator}projectId=${projectId}`, req.url),
          upstream.status as 301 | 302 | 303 | 307 | 308
        );
      }
    }

    const contentType = upstream.headers.get("content-type") || "text/html";
    const body = await upstream.arrayBuffer();

    if (contentType.includes("text/html")) {
      let html = new TextDecoder().decode(body);
      html = html.replace(
        /(\s(?:src|href))="(\/_next\/[^"]+)"/g,
        `$1="/api/preview$2?projectId=${projectId}"`
      );
      html = html.replace(
        new RegExp(`http://localhost:${project.port}`, "g"),
        `/api/preview`
      );
      return new NextResponse(html, {
        status: upstream.status,
        headers: { "Content-Type": contentType },
      });
    }

    return new NextResponse(body, {
      status: upstream.status,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": upstream.headers.get("cache-control") || "no-cache",
      },
    });
  } catch {
    return NextResponse.json({ error: "Preview server unreachable" }, { status: 502 });
  }
}
