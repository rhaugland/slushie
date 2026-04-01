import { readManifest, getEnabledFeatures } from "@/lib/manifest";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const manifest = readManifest();
  return NextResponse.json({ features: getEnabledFeatures(manifest) });
}
