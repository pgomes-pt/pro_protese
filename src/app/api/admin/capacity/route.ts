import { UserRole } from "@prisma/client";
import { addDays, format, startOfDay } from "date-fns";
import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { getCapacityForDate } from "@/lib/capacity";

export const dynamic = "force-dynamic";

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

  const dateKey = format(dayStart, "yyyy-MM-dd");

  try {
    const { usedHours, maxHours, remainingHours, orders } =
      await getCapacityForDate(dayStart);
    const percentUsed =
      maxHours > 0 ? Math.round((usedHours / maxHours) * 100) : 0;
    const isAtCapacity = remainingHours <= 0;

    const ordersOut = orders.map((o) => ({
      id: o.id,
      workType: o.workType,
      estimatedHours: o.estimatedHours,
      patientName: o.patientName ?? null,
      clinicName: o.clinic.name,
      capacityStatus: o.capacityStatus,
      expectedDeliveryAt: o.expectedDeliveryAt?.toISOString() ?? null,
    }));

    return NextResponse.json({
      date: dateKey,
      maxHours,
      usedHours,
      remainingHours,
      percentUsed,
      isAtCapacity,
      orders: ordersOut,
    });
  } catch (e) {
    console.error(e);
    return jsonError(500, "Erro ao calcular a capacidade.");
  }
}
