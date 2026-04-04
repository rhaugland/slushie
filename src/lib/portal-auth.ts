import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "./prisma";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "slushie-machine-dev-secret-change-in-prod"
);
const COOKIE_NAME = "session";

export async function getCurrentClientUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  let payload: { userId: string; email: string };
  try {
    const result = await jwtVerify(token, JWT_SECRET);
    payload = { userId: result.payload.userId as string, email: result.payload.email as string };
  } catch {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      email: true,
      name: true,
      clientMemberships: {
        include: {
          client: { select: { id: true, name: true } },
          projectAccess: {
            include: {
              project: { select: { id: true, name: true, deployUrl: true } },
            },
          },
        },
      },
    },
  });

  if (!user || user.clientMemberships.length === 0) return null;

  return user;
}
