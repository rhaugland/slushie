import { readManifest, flattenRoutes } from "@/lib/manifest";
import { existsSync } from "fs";
import path from "path";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function FeaturePage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const route = "/features/" + slug.join("/");
  const manifest = readManifest();
  const routes = flattenRoutes(manifest.features);
  const match = routes.find((r) => r.route === route);

  if (!match) return notFound();

  const modulePath = path.join(process.cwd(), "features", match.id, "page.tsx");
  if (!existsSync(modulePath)) {
    return (
      <div className="p-8 text-center text-gray-400">
        Feature module not yet built.
      </div>
    );
  }

  const FeatureModule = (await import(`@/features/${match.id}/page`)).default;
  return <FeatureModule />;
}
