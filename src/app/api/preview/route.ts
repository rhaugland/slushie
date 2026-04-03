import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function proxyPath(path: string, projectId: string): string {
  if (path.startsWith("/api/preview")) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `/api/preview${path}${sep}projectId=${projectId}`;
}

function rewriteHtml(html: string, port: number, projectId: string, disabledRoutes: string[] = []): string {
  const base = `http://localhost:${port}`;
  html = html.replace(new RegExp(base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "");

  html = html.replace(
    /((?:src|href|srcSet|srcset)\s*=\s*")((?:[^"]*))(")/gi,
    (_m, pre, value, post) => {
      if (/srcset/i.test(pre)) {
        const rewritten = value.replace(
          /(\/[^\s,]+)/g,
          (p: string) => p.startsWith("/api/preview") ? p : proxyPath(p, projectId)
        );
        return `${pre}${rewritten}${post}`;
      }
      if (value.startsWith("/") && !value.startsWith("/api/preview")) {
        return `${pre}${proxyPath(value, projectId)}${post}`;
      }
      return _m;
    }
  );

  html = html.replace(
    /(url\(\s*['"]?)(\/(?!api\/preview)[^'")]*?)(['"]?\s*\))/g,
    (_m, pre, path, post) => `${pre}${proxyPath(path, projectId)}${post}`
  );

  const baseTag = `<script>
    const _origFetch = window.fetch;
    window.fetch = function(url, opts) {
      if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('/api/preview')) {
        const sep = url.includes('?') ? '&' : '?';
        url = '/api/preview' + url + sep + 'projectId=${projectId}';
      }
      return _origFetch.call(this, url, opts);
    };
  </script>`;

  // Feature flag script: hide links/nav items pointing to disabled routes
  const featureFlagTag = disabledRoutes.length > 0 ? `<script>
    window.__DISABLED_ROUTES__ = ${JSON.stringify(disabledRoutes)};
    function hideDisabledLinks() {
      var routes = window.__DISABLED_ROUTES__;
      document.querySelectorAll('a[href]').forEach(function(a) {
        var href = a.getAttribute('href') || '';
        for (var i = 0; i < routes.length; i++) {
          var r = routes[i];
          if (href === r || href.startsWith(r + '/') ||
              href.indexOf('/api/preview' + r) !== -1 ||
              href.indexOf(encodeURIComponent(r)) !== -1) {
            var target = a.closest('li') || a.closest('[role="menuitem"]') || a;
            target.style.display = 'none';
            break;
          }
        }
      });
    }
    hideDisabledLinks();
    new MutationObserver(hideDisabledLinks).observe(document.documentElement, { childList: true, subtree: true });
  </script>` : "";

  if (html.includes("</head>")) {
    html = html.replace("</head>", baseTag + featureFlagTag + "</head>");
  } else {
    html = baseTag + featureFlagTag + html;
  }

  return html;
}

async function getDisabledRoutes(projectId: string): Promise<string[]> {
  const disabledFeatures = await prisma.feature.findMany({
    where: {
      projectId,
      parentId: { not: null },
      enabled: false,
      route: { not: null },
    },
    select: { route: true },
  });

  return disabledFeatures
    .map(f => f.route)
    .filter((r): r is string => r !== null);
}

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

  const disabledRoutes = await getDisabledRoutes(projectId);

  try {
    // Use redirect: "manual" to check if root redirects to a disabled route
    const upstream = await fetch(`http://localhost:${project.port}/`, {
      headers: { "Accept": req.headers.get("accept") || "*/*", "Accept-Encoding": "identity" },
      redirect: "manual",
    });

    // If root redirects to a disabled route, return blank page
    if (upstream.status >= 300 && upstream.status < 400) {
      const location = upstream.headers.get("location");
      if (location) {
        const redirectPath = location.replace(`http://localhost:${project.port}`, "");
        if (disabledRoutes.some(r => redirectPath === r || redirectPath.startsWith(r + "/"))) {
          const blankHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#0a0f1a"></body></html>`;
          return new NextResponse(blankHtml, {
            status: 200,
            headers: { "Content-Type": "text/html" },
          });
        }
        // Not disabled — follow the redirect manually
        const followed = await fetch(`http://localhost:${project.port}${redirectPath}`, {
          headers: { "Accept": req.headers.get("accept") || "*/*", "Accept-Encoding": "identity" },
          redirect: "follow",
        });
        const contentType = followed.headers.get("content-type") || "text/html";
        const body = await followed.arrayBuffer();
        if (contentType.includes("text/html")) {
          const html = rewriteHtml(new TextDecoder().decode(body), project.port, projectId, disabledRoutes);
          return new NextResponse(html, { status: 200, headers: { "Content-Type": contentType } });
        }
        return new NextResponse(body, { status: followed.status, headers: { "Content-Type": contentType } });
      }
    }

    const contentType = upstream.headers.get("content-type") || "text/html";
    const body = await upstream.arrayBuffer();

    if (contentType.includes("text/html")) {
      const html = rewriteHtml(
        new TextDecoder().decode(body),
        project.port,
        projectId,
        disabledRoutes
      );
      return new NextResponse(html, {
        status: 200,
        headers: { "Content-Type": contentType },
      });
    }

    return new NextResponse(body, {
      status: upstream.status,
      headers: { "Content-Type": contentType },
    });
  } catch {
    return NextResponse.json({ error: "Preview server unreachable" }, { status: 502 });
  }
}
