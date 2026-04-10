import { UserRole } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

function parseNonNegativeInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (!Number.isInteger(value) || value < 0) return null;
  return value;
}

function parseNonNegativeFloat(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0) return null;
  return value;
}

export async function GET() {
  const auth = await authenticateRequest();
  if (!auth.ok) {
    return jsonError(auth.status, auth.message);
  }
  if (auth.dbUser.role !== UserRole.ADMIN) {
    return jsonError(403, "Apenas administradores podem consultar a configuração de urgências.");
  }

  try {
    const row = await prisma.urgencyConfig.findFirst({
      orderBy: { updatedAt: "desc" },
    });
    if (!row) {
      return NextResponse.json({
        maxDailyUrgent: 10,
        maxDailySuperUrgent: 5,
        surchargePercent: 60,
        surchargeMinValue: null as number | null,
      });
    }
    return NextResponse.json(row);
  } catch (e) {
    console.error(e);
    return jsonError(500, "Erro ao carregar a configuração de urgências.");
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await authenticateRequest();
  if (!auth.ok) {
    return jsonError(auth.status, auth.message);
  }
  if (auth.dbUser.role !== UserRole.ADMIN) {
    return jsonError(403, "Apenas administradores podem alterar a configuração de urgências.");
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError(400, "Corpo do pedido inválido (JSON esperado).");
  }

  const maxDailyUrgent = parseNonNegativeInt(body.maxDailyUrgent);
  const maxDailySuperUrgent = parseNonNegativeInt(body.maxDailySuperUrgent);

  if (maxDailyUrgent === null) {
    return jsonError(400, "maxDailyUrgent deve ser um número inteiro ≥ 0.");
  }
  if (maxDailySuperUrgent === null) {
    return jsonError(400, "maxDailySuperUrgent deve ser um número inteiro ≥ 0.");
  }

  let surchargePercent: number | undefined;
  if (body.surchargePercent !== undefined) {
    const p = parseNonNegativeFloat(body.surchargePercent);
    if (p === null) {
      return jsonError(400, "surchargePercent deve ser um número ≥ 0.");
    }
    surchargePercent = p;
  }

  try {
    const existing = await prisma.urgencyConfig.findFirst({
      orderBy: { updatedAt: "desc" },
    });

    const updated = existing
      ? await prisma.urgencyConfig.update({
          where: { id: existing.id },
          data: {
            maxDailyUrgent,
            maxDailySuperUrgent,
            ...(surchargePercent !== undefined ? { surchargePercent } : {}),
          },
        })
      : await prisma.urgencyConfig.create({
          data: {
            maxDailyUrgent,
            maxDailySuperUrgent,
            surchargePercent: surchargePercent ?? 60,
          },
        });

    return NextResponse.json(updated);
  } catch (e) {
    console.error(e);
    return jsonError(500, "Erro ao atualizar a configuração de urgências.");
  }
}
