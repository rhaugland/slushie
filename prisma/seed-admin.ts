import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcrypt";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL required");

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  const email = process.env.ADMIN_EMAIL || "ryan@w3.dev";
  const name = process.env.ADMIN_NAME || "Ryan";
  const password = process.env.ADMIN_PASSWORD || "changeme";

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: { name, passwordHash },
    create: { email, name, passwordHash },
  });

  console.log(`User created/updated: ${user.email} (${user.id})`);

  const workspaces = await prisma.workspace.findMany();
  for (const ws of workspaces) {
    await prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: ws.id, userId: user.id } },
      update: { role: "owner" },
      create: { workspaceId: ws.id, userId: user.id, role: "owner" },
    });
    console.log(`Linked as owner of workspace: ${ws.name}`);
  }

  const clients = await prisma.client.findMany();
  for (const client of clients) {
    await prisma.clientMember.upsert({
      where: { clientId_userId: { clientId: client.id, userId: user.id } },
      update: { role: "admin" },
      create: { clientId: client.id, userId: user.id, role: "admin" },
    });
    console.log(`Linked as admin of client: ${client.name}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
