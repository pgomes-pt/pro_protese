import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
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

export async function PATCH(request: Request) {
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

  try {
    const existing = await prisma.urgencyConfig.findFirst({
      orderBy: { updatedAt: "desc" },
    });

    const updated = existing
      ? await prisma.urgencyConfig.update({
          where: { id: existing.id },
          data: { maxDailyUrgent, maxDailySuperUrgent },
        })
      : await prisma.urgencyConfig.create({
          data: { maxDailyUrgent, maxDailySuperUrgent },
        });

    return NextResponse.json(updated);
  } catch (e) {
    console.error(e);
    return jsonError(500, "Erro ao atualizar a configuração de urgências.");
  }
}
