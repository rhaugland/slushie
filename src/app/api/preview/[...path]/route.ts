import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function getProject(projectId: string) {
  return prisma.project.findUnique({
    where: { id: projectId },
    select: { port: true, deployStatus: true },
  });
}

function proxyPath(path: string, projectId: string): string {
  if (path.startsWith("/api/preview")) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `/api/preview${path}${sep}projectId=${projectId}`;
}

function rewriteHtml(html: string, port: number, projectId: string): string {
  const base = `http://localhost:${port}`;

  // Rewrite absolute localhost URLs
  html = html.replace(new RegExp(base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "");

  // Rewrite src, href, srcSet attributes with absolute paths
  html = html.replace(
    /((?:src|href|srcSet|srcset)\s*=\s*")((?:[^"]*))(")/gi,
    (_m, pre, value, post) => {
      // srcSet has multiple entries separated by commas
      if (/srcset/i.test(pre)) {
        const rewritten = value.replace(
          /(\/[^\s,]+)/g,
          (path: string) => {
            if (path.startsWith("/api/preview")) return path;
            return proxyPath(path, projectId);
          }
        );
        return `${pre}${rewritten}${post}`;
      }
      // Regular src/href — single path
      if (value.startsWith("/") && !value.startsWith("/api/preview")) {
        return `${pre}${proxyPath(value, projectId)}${post}`;
      }
      return _m;
    }
  );

  // Rewrite url() in inline styles (for background images etc)
  html = html.replace(
    /(url\(\s*['"]?)(\/(?!api\/preview)[^'")]*?)(['"]?\s*\))/g,
    (_m, pre, path, post) => proxyPath(path, projectId) ? `${pre}${proxyPath(path, projectId)}${post}` : _m
  );

  // Inject a <base> tag fallback: intercept fetch/XHR for dynamic loads
  // Also add a meta tag so the browser resolves relative URLs through proxy
  const baseTag = `<script>
    // Patch fetch to route through preview proxy
    const _origFetch = window.fetch;
    window.fetch = function(url, opts) {
      if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('/api/preview')) {
        const sep = url.includes('?') ? '&' : '?';
        url = '/api/preview' + url + sep + 'projectId=${projectId}';
      }
      return _origFetch.call(this, url, opts);
    };
  </script>`;

  // Insert before </head> or at the start
  if (html.includes("</head>")) {
    html = html.replace("</head>", baseTag + "</head>");
  } else {
    html = baseTag + html;
  }

  return html;
}

async function proxyRequest(
  req: NextRequest,
  targetPath: string,
  projectId: string
) {
  const project = await getProject(projectId);

  if (!project?.port || project.deployStatus !== "running") {
    return NextResponse.json({ error: "Preview not running" }, { status: 503 });
  }

  // Forward query params (except projectId) to upstream
  const upstreamUrl = new URL(`http://localhost:${project.port}${targetPath}`);
  req.nextUrl.searchParams.forEach((val, key) => {
    if (key !== "projectId") upstreamUrl.searchParams.set(key, val);
  });

  try {
    const upstream = await fetch(upstreamUrl.toString(), {
      headers: {
        "Accept": req.headers.get("accept") || "*/*",
        "Accept-Encoding": "identity",
      },
      redirect: "manual",
    });

    // Handle redirects
    if (upstream.status >= 300 && upstream.status < 400) {
      const location = upstream.headers.get("location");
      if (location) {
        let proxied = location.replace(
          `http://localhost:${project.port}`,
          ""
        );
        // If it's a relative path, prefix with proxy
        if (proxied.startsWith("/")) {
          const sep = proxied.includes("?") ? "&" : "?";
          return NextResponse.redirect(
            new URL(`/api/preview${proxied}${sep}projectId=${projectId}`, req.url),
            upstream.status as 301 | 302 | 303 | 307 | 308
          );
        }
      }
    }

    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    const body = await upstream.arrayBuffer();

    // Rewrite HTML responses
    if (contentType.includes("text/html")) {
      const html = rewriteHtml(
        new TextDecoder().decode(body),
        project.port,
        projectId
      );
      return new NextResponse(html, {
        status: upstream.status,
        headers: { "Content-Type": contentType },
      });
    }

    // Pass through all other content types (CSS, JS, images, fonts, etc.)
    return new NextResponse(body, {
      status: upstream.status,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": upstream.headers.get("cache-control") || "no-cache",
        ...(upstream.headers.get("content-encoding")
          ? { "Content-Encoding": upstream.headers.get("content-encoding")! }
          : {}),
      },
    });
  } catch {
    return NextResponse.json({ error: "Preview server unreachable" }, { status: 502 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const projectId = req.nextUrl.searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  const targetPath = "/" + path.join("/");
  return proxyRequest(req, targetPath, projectId);
}
