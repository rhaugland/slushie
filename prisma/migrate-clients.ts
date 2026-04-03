import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const adapter = new PrismaPg({
  connectionString: "postgresql://ryanhaugland@localhost:5432/slushie_machine",
});
const prisma = new PrismaClient({ adapter });

async function main() {
  // 1. Find all unique (workspaceId, clientName) pairs from projects
  const projects = await prisma.project.findMany({
    select: { id: true, workspaceId: true, clientName: true },
  });

  const clientMap = new Map<string, string>(); // key: "workspaceId:clientName" → clientId

  // Collect unique pairs
  const uniquePairs = new Map<string, { workspaceId: string; clientName: string }>();
  for (const project of projects) {
    const key = `${project.workspaceId}:${project.clientName}`;
    if (!uniquePairs.has(key)) {
      uniquePairs.set(key, { workspaceId: project.workspaceId, clientName: project.clientName });
    }
  }

  // 2. Create a Client record for each unique pair
  console.log(`Creating ${uniquePairs.size} client(s)...`);
  for (const [key, { workspaceId, clientName }] of uniquePairs) {
    const client = await prisma.client.create({
      data: { name: clientName, workspaceId },
    });
    clientMap.set(key, client.id);
    console.log(`  Created client "${clientName}" (${client.id}) for workspace ${workspaceId}`);
  }

  // 3. Update each project's clientId
  console.log(`\nUpdating ${projects.length} project(s) with clientId...`);
  for (const project of projects) {
    const key = `${project.workspaceId}:${project.clientName}`;
    const clientId = clientMap.get(key);
    if (!clientId) {
      throw new Error(`No client found for key ${key}`);
    }
    await prisma.project.update({
      where: { id: project.id },
      data: { clientId },
    });
    console.log(`  Updated project ${project.id} → clientId ${clientId}`);
  }

  // 4. Migrate ProjectMember records to ClientMember + ClientMemberProject
  const projectMembers = await prisma.projectMember.findMany({
    include: { project: { select: { clientId: true } } },
  });

  console.log(`\nMigrating ${projectMembers.length} ProjectMember record(s)...`);

  for (const pm of projectMembers) {
    const clientId = pm.project.clientId;
    if (!clientId) {
      console.warn(`  WARN: Project for ProjectMember ${pm.id} has no clientId — skipping`);
      continue;
    }

    // Find or create a ClientMember for this (clientId, userId/invitedEmail) combination
    let clientMember = await prisma.clientMember.findFirst({
      where: pm.userId
        ? { clientId, userId: pm.userId }
        : { clientId, invitedEmail: pm.invitedEmail },
    });

    if (!clientMember) {
      clientMember = await prisma.clientMember.create({
        data: {
          clientId,
          userId: pm.userId ?? undefined,
          invitedEmail: pm.invitedEmail ?? undefined,
          role: pm.role,
        },
      });
      console.log(`  Created ClientMember ${clientMember.id} for client ${clientId}`);
    }

    // Create ClientMemberProject link (upsert to be safe)
    await prisma.clientMemberProject.upsert({
      where: {
        clientMemberId_projectId: {
          clientMemberId: clientMember.id,
          projectId: pm.projectId,
        },
      },
      create: {
        clientMemberId: clientMember.id,
        projectId: pm.projectId,
      },
      update: {},
    });
    console.log(`  Linked ClientMember ${clientMember.id} → Project ${pm.projectId}`);
  }

  console.log("\nMigration complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
