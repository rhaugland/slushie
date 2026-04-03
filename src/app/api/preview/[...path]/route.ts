import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function getProject(projectId: string) {
  return prisma.project.findUnique({
    where: { id: projectId },
    select: { port: true, deployStatus: true },
  });
}

/**
 * Get all disabled micro feature routes for a project.
 * Cached per-request (no global cache to ensure toggle changes are instant).
 */
/**
 * Get disabled micro feature routes for a project.
 * Only checks micro features (with parentId) — major features being disabled
 * doesn't block previews of their children.
 */
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

function disabledPageHtml(): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;background:#0a0f1a"></body></html>`;
}

function proxyPath(path: string, projectId: string): string {
  if (path.startsWith("/api/preview")) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `/api/preview${path}${sep}projectId=${projectId}`;
}

function rewriteCss(css: string, projectId: string): string {
  // Rewrite url() references in CSS files (fonts, background images, etc.)
  return css.replace(
    /(url\(\s*['"]?)(\/(?!api\/preview)[^'")]*?)(['"]?\s*\))/g,
    (_m, pre, path, post) => `${pre}${proxyPath(path, projectId)}${post}`
  );
}

function rewriteHtml(html: string, port: number, projectId: string, isolate: boolean = false, disabledRoutes: string[] = []): string {
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

  // Isolation mode: hide nav, header, footer, sidebar — show only main content
  const isolationTag = isolate ? `<style id="slushie-isolate">
    nav, header, footer, aside,
    [role="navigation"], [role="banner"], [role="contentinfo"],
    .navbar, .nav-bar, .navigation, .sidebar, .side-bar,
    .header, .footer, .topbar, .top-bar, .app-header, .app-footer,
    .layout-header, .layout-footer, .layout-sidebar {
      display: none !important;
    }
    /* Remove layout padding/margins that assume nav exists */
    main, [role="main"], .main-content, .content, .page-content {
      margin: 0 !important;
      padding: 16px !important;
      max-width: 100% !important;
      min-height: auto !important;
    }
    body {
      overflow: auto !important;
    }
  </style>` : "";

  // Insert before </head> or at the start
  if (html.includes("</head>")) {
    html = html.replace("</head>", baseTag + featureFlagTag + isolationTag + "</head>");
  } else {
    html = baseTag + featureFlagTag + isolationTag + html;
  }

  return html;
}

async function proxyRequest(
  req: NextRequest,
  targetPath: string,
  projectId: string,
  isolate: boolean = false,
  disabledRoutes: string[] = []
) {
  const project = await getProject(projectId);

  if (!project?.port || project.deployStatus !== "running") {
    return NextResponse.json({ error: "Preview not running" }, { status: 503 });
  }

  // Forward query params (except projectId) to upstream
  const upstreamUrl = new URL(`http://localhost:${project.port}${targetPath}`);
  req.nextUrl.searchParams.forEach((val, key) => {
    if (key !== "projectId" && key !== "isolate") upstreamUrl.searchParams.set(key, val);
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
        // Use manual Location header to keep it relative (NextResponse.redirect makes it absolute with localhost)
        if (proxied.startsWith("/")) {
          const sep = proxied.includes("?") ? "&" : "?";
          return new NextResponse(null, {
            status: upstream.status,
            headers: { Location: `/api/preview${proxied}${sep}projectId=${projectId}` },
          });
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
        projectId,
        isolate,
        disabledRoutes
      );
      return new NextResponse(html, {
        status: upstream.status,
        headers: { "Content-Type": contentType },
      });
    }

    // Rewrite CSS responses (font-face url(), background-image, etc.)
    if (contentType.includes("text/css")) {
      const css = rewriteCss(new TextDecoder().decode(body), projectId);
      return new NextResponse(css, {
        status: upstream.status,
        headers: { "Content-Type": contentType },
      });
    }

    // Pass through all other content types (JS, images, fonts, etc.)
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

  const isolate = req.nextUrl.searchParams.get("isolate") === "true";
  const targetPath = "/" + path.join("/");

  const disabledRoutes = await getDisabledRoutes(projectId);

  // If this path matches a disabled micro feature route, return blank page
  if (disabledRoutes.some(r => targetPath === r || targetPath.startsWith(r + "/"))) {
    return new NextResponse(disabledPageHtml(), {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });
  }

  return proxyRequest(req, targetPath, projectId, isolate, disabledRoutes);
}
