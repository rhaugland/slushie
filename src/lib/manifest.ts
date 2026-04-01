import { readFile, writeFile } from "fs/promises";
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

export async function readManifest(projectDir: string): Promise<Manifest> {
  const raw = await readFile(
    path.join(projectDir, "features.json"),
    "utf-8"
  );
  return JSON.parse(raw);
}

export async function writeManifest(
  projectDir: string,
  manifest: Manifest
): Promise<void> {
  await writeFile(
    path.join(projectDir, "features.json"),
    JSON.stringify(manifest, null, 2)
  );
}

export function addFeatureToManifest(
  manifest: Manifest,
  feature: { id: string; title: string; route: string; parentId: string | null }
): Manifest {
  const node: ManifestFeature = {
    id: feature.id,
    title: feature.title,
    enabled: true,
    route: feature.route,
    navIcon: "Box",
    children: [],
  };

  if (!feature.parentId) {
    return { features: [...manifest.features, node] };
  }

  return {
    features: manifest.features.map((f) =>
      f.id === feature.parentId
        ? { ...f, children: [...f.children, node] }
        : f
    ),
  };
}

export function toggleFeatureInManifest(
  manifest: Manifest,
  featureId: string,
  enabled: boolean
): Manifest {
  return {
    features: manifest.features.map((f) => {
      if (f.id === featureId) {
        return { ...f, enabled };
      }
      return {
        ...f,
        children: f.children.map((c) =>
          c.id === featureId ? { ...c, enabled } : c
        ),
      };
    }),
  };
}

export function removeFeatureFromManifest(
  manifest: Manifest,
  featureId: string
): Manifest {
  return {
    features: manifest.features
      .filter((f) => f.id !== featureId)
      .map((f) => ({
        ...f,
        children: f.children.filter((c) => c.id !== featureId),
      })),
  };
}
