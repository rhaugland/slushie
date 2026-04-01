import { readFileSync } from "fs";
import path from "path";

export type ManifestFeature = {
  id: string;
  title: string;
  enabled: boolean;
  route: string;
  navIcon: string;
  children: ManifestFeature[];
};

export type Manifest = {
  features: ManifestFeature[];
};

export function readManifest(): Manifest {
  const raw = readFileSync(
    path.join(process.cwd(), "features.json"),
    "utf-8"
  );
  return JSON.parse(raw);
}

export function getEnabledFeatures(manifest: Manifest): ManifestFeature[] {
  return manifest.features
    .filter((f) => f.enabled)
    .map((f) => ({
      ...f,
      children: f.children.filter((c) => c.enabled),
    }));
}

export function flattenRoutes(
  features: ManifestFeature[]
): { route: string; id: string }[] {
  const routes: { route: string; id: string }[] = [];
  for (const f of features) {
    if (f.enabled) {
      routes.push({ route: f.route, id: f.id });
      for (const c of f.children) {
        if (c.enabled) {
          routes.push({ route: c.route, id: c.id });
        }
      }
    }
  }
  return routes;
}
