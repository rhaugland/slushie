import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function proxyPath(path: string, projectId: string): string {
  if (path.startsWith("/api/preview")) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `/api/preview${path}${sep}projectId=${projectId}`;
}

function rewriteHtml(html: string, baseUrl: string, projectId: string, disabledRoutes: string[] = []): string {
  // Strip the upstream base URL from absolute references
  html = html.replace(new RegExp(baseUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "");

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

function getUpstreamBase(project: { port: number | null; deployUrl: string | null }): string | null {
  if (project.deployUrl && !project.deployUrl.includes("localhost")) {
    return project.deployUrl;
  }
  if (project.port) {
    return `http://localhost:${project.port}`;
  }
  return project.deployUrl || null;
}

async function getDisabledRoutes(projectId: string): Promise<string[]> {
  const disabledFeatures = await prisma.feature.findMany({
    where: {
      projectId,
      enabled: false,
      route: { not: null },
    },
    select: { route: true, id: true, parentId: true },
  });

  const routes = disabledFeatures
    .map(f => f.route)
    .filter((r): r is string => r !== null);

  const disabledMajorIds = disabledFeatures
    .filter(f => !f.parentId)
    .map(f => f.id);

  if (disabledMajorIds.length > 0) {
    const childFeatures = await prisma.feature.findMany({
      where: {
        parentId: { in: disabledMajorIds },
        route: { not: null },
      },
      select: { route: true },
    });
    for (const child of childFeatures) {
      if (child.route && !routes.includes(child.route)) {
        routes.push(child.route);
      }
    }
  }

  return routes;
}

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { port: true, deployUrl: true, deployStatus: true },
  });

  if (!project || project.deployStatus !== "running") {
    return NextResponse.json({ error: "Preview not running" }, { status: 503 });
  }

  const upstreamBase = getUpstreamBase(project);
  if (!upstreamBase) {
    return NextResponse.json({ error: "No preview URL configured" }, { status: 503 });
  }

  const disabledRoutes = await getDisabledRoutes(projectId);

  try {
    const upstream = await fetch(`${upstreamBase}/`, {
      headers: { "Accept": req.headers.get("accept") || "*/*", "Accept-Encoding": "identity" },
      redirect: "manual",
    });

    if (upstream.status >= 300 && upstream.status < 400) {
      const location = upstream.headers.get("location");
      if (location) {
        const redirectPath = location.replace(upstreamBase, "");
        if (disabledRoutes.some(r => redirectPath === r || redirectPath.startsWith(r + "/"))) {
          const blankHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#0a0f1a"></body></html>`;
          return new NextResponse(blankHtml, {
            status: 200,
            headers: { "Content-Type": "text/html" },
          });
        }
        const followed = await fetch(`${upstreamBase}${redirectPath}`, {
          headers: { "Accept": req.headers.get("accept") || "*/*", "Accept-Encoding": "identity" },
          redirect: "follow",
        });
        const contentType = followed.headers.get("content-type") || "text/html";
        const body = await followed.arrayBuffer();
        if (contentType.includes("text/html")) {
          const html = rewriteHtml(new TextDecoder().decode(body), upstreamBase, projectId, disabledRoutes);
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
        upstreamBase,
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
