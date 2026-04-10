import { UserRole, WorkType } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const DEFAULT_MAX_DAILY_HOURS = 7;

function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

function isWorkType(value: unknown): value is WorkType {
  return typeof value === "string" && Object.values(WorkType).includes(value as WorkType);
}

function parseOptionalPositiveFloat(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0) return null;
  return value;
}

export async function GET() {
  const auth = await authenticateRequest();
  if (!auth.ok) {
    return jsonError(auth.status, auth.message);
  }

  try {
    const [labRow, workTypeConfigs] = await Promise.all([
      prisma.labConfig.findFirst({ orderBy: { updatedAt: "desc" } }),
      prisma.workTypeConfig.findMany({ orderBy: { workType: "asc" } }),
    ]);

    const labConfig = labRow ?? {
      id: null as string | null,
      maxDailyHours: DEFAULT_MAX_DAILY_HOURS,
      createdAt: null as Date | null,
      updatedAt: null as Date | null,
    };

    return NextResponse.json({ labConfig, workTypeConfigs });
  } catch (e) {
    console.error(e);
    return jsonError(500, "Erro ao carregar a configuração do laboratório.");
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await authenticateRequest();
  if (!auth.ok) {
    return jsonError(auth.status, auth.message);
  }
  if (auth.dbUser.role !== UserRole.ADMIN) {
    return jsonError(403, "Apenas administradores podem alterar esta configuração.");
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError(400, "Corpo do pedido inválido (JSON esperado).");
  }

  const maxDailyHoursRaw = parseOptionalPositiveFloat(body.maxDailyHours);
  if (maxDailyHoursRaw === null) {
    return jsonError(400, "maxDailyHours deve ser um número ≥ 0.");
  }

  const workTypeUpdates = body.workTypeUpdates;
  if (
    workTypeUpdates !== undefined &&
    (!Array.isArray(workTypeUpdates) || workTypeUpdates.some((u) => u === null || typeof u !== "object"))
  ) {
    return jsonError(400, "workTypeUpdates deve ser um array de { workType, estimatedHours }.");
  }

  const updates: { workType: WorkType; estimatedHours: number }[] = [];
  if (Array.isArray(workTypeUpdates)) {
    for (const item of workTypeUpdates) {
      const row = item as Record<string, unknown>;
      const wt = row.workType;
      const eh = parseOptionalPositiveFloat(row.estimatedHours);
      if (!isWorkType(wt)) {
        return jsonError(400, "workType inválido em workTypeUpdates.");
      }
      if (eh === undefined || eh === null) {
        return jsonError(400, "estimatedHours deve ser um número ≥ 0 em cada entrada.");
      }
      updates.push({ workType: wt, estimatedHours: eh });
    }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      let labConfig = await tx.labConfig.findFirst({ orderBy: { updatedAt: "desc" } });

      if (maxDailyHoursRaw !== undefined) {
        if (labConfig) {
          labConfig = await tx.labConfig.update({
            where: { id: labConfig.id },
            data: { maxDailyHours: maxDailyHoursRaw },
          });
        } else {
          labConfig = await tx.labConfig.create({
            data: { maxDailyHours: maxDailyHoursRaw },
          });
        }
      }

      for (const { workType, estimatedHours } of updates) {
        await tx.workTypeConfig.update({
          where: { workType },
          data: { estimatedHours },
        });
      }

      const workTypeConfigs = await tx.workTypeConfig.findMany({
        orderBy: { workType: "asc" },
      });

      return { labConfig, workTypeConfigs };
    });

    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    return jsonError(500, "Erro ao atualizar a configuração do laboratório.");
  }
}
