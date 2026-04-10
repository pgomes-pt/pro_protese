import { UserRole } from "@prisma/client";
import { eachDayOfInterval, format, startOfDay } from "date-fns";
import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { getCapacityForDate } from "@/lib/capacity";
import { isWorkingDay } from "@/lib/dates";

export const dynamic = "force-dynamic";

function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

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

  const startRaw = request.nextUrl.searchParams.get("startDate");
  const endRaw = request.nextUrl.searchParams.get("endDate");
  if (!startRaw || !endRaw) {
    return jsonError(400, "Indique startDate e endDate (yyyy-MM-dd).");
  }

  const rangeStart = parseLocalDateString(startRaw);
  const rangeEnd = parseLocalDateString(endRaw);
  if (!rangeStart || !rangeEnd) {
    return jsonError(400, "Datas inválidas (use yyyy-MM-dd).");
  }
  if (rangeEnd.getTime() < rangeStart.getTime()) {
    return jsonError(400, "endDate deve ser igual ou posterior a startDate.");
  }

  try {
    const days: {
      date: string;
      maxHours: number;
      usedHours: number;
      remainingHours: number;
      percentUsed: number;
      isAtCapacity: boolean;
      orders: {
        id: string;
        workType: string;
        estimatedHours: number;
        patientName: string | null;
        clinicName: string;
        capacityStatus: string;
        expectedDeliveryAt: string | null;
      }[];
    }[] = [];

    const intervalDays = eachDayOfInterval({
      start: rangeStart,
      end: rangeEnd,
    });

    for (const d of intervalDays) {
      if (!isWorkingDay(d)) {
        continue;
      }
      const dayStart = startOfDay(d);
      const { usedHours, maxHours, remainingHours, orders } =
        await getCapacityForDate(dayStart);
      const percentUsed =
        maxHours > 0 ? Math.round((usedHours / maxHours) * 100) : 0;
      const isAtCapacity = remainingHours <= 0;
      const dateKey = format(dayStart, "yyyy-MM-dd");

      days.push({
        date: dateKey,
        maxHours,
        usedHours,
        remainingHours,
        percentUsed,
        isAtCapacity,
        orders: orders.map((o) => ({
          id: o.id,
          workType: o.workType,
          estimatedHours: o.estimatedHours,
          patientName: o.patientName ?? null,
          clinicName: o.clinic.name,
          capacityStatus: o.capacityStatus,
          expectedDeliveryAt: o.expectedDeliveryAt?.toISOString() ?? null,
        })),
      });
    }

    return NextResponse.json({
      startDate: format(rangeStart, "yyyy-MM-dd"),
      endDate: format(rangeEnd, "yyyy-MM-dd"),
      days,
    });
  } catch (e) {
    console.error(e);
    return jsonError(500, "Erro ao calcular a capacidade no intervalo.");
  }
}
