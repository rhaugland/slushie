import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const ws = await prisma.workspace.findMany({ select: { id: true, name: true, slug: true } });
  console.log(JSON.stringify(ws, null, 2));
}
main().finally(() => prisma.$disconnect());
