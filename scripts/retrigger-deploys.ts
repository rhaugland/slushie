import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: "postgresql://ryanhaugland@localhost:5432/slushie_machine" });
const prisma = new PrismaClient({ adapter });

async function main() {
  const projects = await prisma.project.findMany({
    select: { id: true, name: true, deployUrl: true, deployStatus: true },
  });
  const features = await prisma.feature.groupBy({ by: ["projectId"], _count: true });
  const fm = Object.fromEntries(features.map((f) => [f.projectId, f._count]));

  console.log("\n=== All Projects ===");
  for (const p of projects) {
    console.log(`  ${p.name} | deployUrl=${p.deployUrl || "NULL"} | status=${p.deployStatus} | features=${fm[p.id] || 0} | id=${p.id}`);
  }

  const needsDeploy = projects.filter((p) => p.deployUrl === null && (fm[p.id] || 0) > 0);
  if (needsDeploy.length === 0) {
    console.log("\nNo projects need re-deploy.");
    return;
  }

  console.log(`\n=== Re-triggering deploy for ${needsDeploy.length} project(s) ===`);
  for (const p of needsDeploy) {
    console.log(`  Sending event for: ${p.name}`);
    const res = await fetch("http://localhost:8288/e/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "project/deploy-codebase",
        data: { projectId: p.id, fileUrl: "/uploads/1775564132231-oterra-main.zip" },
      }),
    });
    const result = await res.json();
    console.log(`    =>`, result);
  }

  console.log("\nDone! Check http://localhost:8288 for progress.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
