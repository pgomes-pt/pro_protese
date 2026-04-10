import { UserRole, WorkStatus } from "@prisma/client";
import { addDays, format, startOfDay } from "date-fns";
import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const DEFAULT_MAX_HOURS = 7;

const EXCLUDED_STATUSES: WorkStatus[] = [
  WorkStatus.ENTREGUE,
  WorkStatus.DEVOLVIDO,
  WorkStatus.EM_ESPERA,
];

function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

/** Parse `yyyy-MM-dd` as local calendar day. */
function parseLocalDateString(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) {
    return null;
  }
  return startOfDay(dt);
}

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest();
  if (!auth.ok) {
    return jsonError(auth.status, auth.message);
  }
  if (auth.dbUser.role !== UserRole.ADMIN) {
    return jsonError(403, "Apenas administradores podem consultar a capacidade.");
  }

  const raw = request.nextUrl.searchParams.get("date");
  const dayStart = raw ? parseLocalDateString(raw) : startOfDay(new Date());
  if (!dayStart) {
    return jsonError(400, "Parâmetro date inválido (use yyyy-MM-dd).");
  }

  const dayEnd = addDays(dayStart, 1);
  const dateKey = format(dayStart, "yyyy-MM-dd");

  try {
    const [labRow, configs, orders] = await Promise.all([
      prisma.labConfig.findFirst({ orderBy: { updatedAt: "desc" } }),
      prisma.workTypeConfig.findMany(),
      prisma.order.findMany({
        where: {
          collectionDate: {
            gte: dayStart,
            lt: dayEnd,
          },
          status: { notIn: EXCLUDED_STATUSES },
        },
        select: {
          id: true,
          workType: true,
          patientName: true,
        },
        orderBy: { id: "asc" },
      }),
    ]);

    const maxHours = labRow?.maxDailyHours ?? DEFAULT_MAX_HOURS;
    const hoursByType = new Map(
      configs.map((c) => [c.workType, c.estimatedHours] as const)
    );

    const ordersOut = orders.map((o) => {
      const estimatedHours = hoursByType.get(o.workType) ?? 0;
      return {
        id: o.id,
        workType: o.workType,
        estimatedHours,
        patientName: o.patientName ?? null,
      };
    });

    const usedHours = ordersOut.reduce((sum, o) => sum + o.estimatedHours, 0);
    const remainingHours = Math.max(0, maxHours - usedHours);
    const percentUsed =
      maxHours > 0 ? Math.round((usedHours / maxHours) * 100) : 0;

    return NextResponse.json({
      date: dateKey,
      maxHours,
      usedHours,
      remainingHours,
      percentUsed,
      orders: ordersOut,
    });
  } catch (e) {
    console.error(e);
    return jsonError(500, "Erro ao calcular a capacidade.");
  }
}
