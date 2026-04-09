import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { localDayRange } from "@/lib/order-logic";

export const dynamic = "force-dynamic";

function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  const auth = await authenticateRequest();
  if (!auth.ok) {
    return jsonError(auth.status, auth.message);
  }

  const { dbUser } = auth;
  if (dbUser.role === UserRole.ESTAFETA) {
    return jsonError(403, "Não tem permissão para consultar disponibilidade.");
  }

  const now = new Date();
  const minutesFromMidnight = now.getHours() * 60 + now.getMinutes();
  const before10 = minutesFromMidnight < 10 * 60;
  const before13 = minutesFromMidnight < 13 * 60;

  try {
    const urgencyConfig = await prisma.urgencyConfig.findFirst({
      orderBy: { updatedAt: "desc" },
    });

    const urgentLimit = urgencyConfig?.maxDailyUrgent ?? 10;
    const superLimit = urgencyConfig?.maxDailySuperUrgent ?? 5;

    const { start, end } = localDayRange(now);

    const [urgentUsed, superUsed] = await Promise.all([
      prisma.order.count({
        where: {
          createdAt: { gte: start, lt: end },
          urgencyLevel: "URGENTE",
        },
      }),
      prisma.order.count({
        where: {
          createdAt: { gte: start, lt: end },
          urgencyLevel: {
            in: ["SUPER_URGENCIA_MANHA", "SUPER_URGENCIA_TARDE"],
          },
        },
      }),
    ]);

    const superAvailable = Math.max(0, superLimit - superUsed);

    return NextResponse.json({
      urgent: {
        limit: urgentLimit,
        used: urgentUsed,
        available: Math.max(0, urgentLimit - urgentUsed),
      },
      superUrgent: {
        limit: superLimit,
        used: superUsed,
        available: superAvailable,
      },
      superUrgenciaManha: {
        available: before10 && superAvailable > 0,
      },
      superUrgenciaTarde: {
        available: before13 && superAvailable > 0,
      },
    });
  } catch (e) {
    console.error(e);
    return jsonError(500, "Erro ao calcular disponibilidade de urgências.");
  }
}
