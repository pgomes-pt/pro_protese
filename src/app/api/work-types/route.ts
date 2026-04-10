import { ClinicStatus, UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { NOVA_CLINIC_WORK_TYPES } from "@/lib/order-logic";

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
    return jsonError(403, "Não tem permissão para consultar tipos de trabalho.");
  }

  if (dbUser.role === UserRole.CLINICA && !dbUser.clinicId) {
    return jsonError(403, "Conta de clínica sem clínica associada.");
  }

  try {
    const [configs, clinic] = await Promise.all([
      prisma.workTypeConfig.findMany({ orderBy: { workType: "asc" } }),
      dbUser.clinicId
        ? prisma.clinic.findUnique({
            where: { id: dbUser.clinicId },
            select: { status: true },
          })
        : Promise.resolve(null),
    ]);

    const clinicStatus = clinic?.status ?? null;

    let filtered = configs;
    if (dbUser.role === UserRole.CLINICA && clinicStatus === ClinicStatus.NOVA) {
      const allowed = new Set<string>(NOVA_CLINIC_WORK_TYPES as readonly string[]);
      filtered = configs.filter((c) => allowed.has(c.workType));
    }

    return NextResponse.json({
      clinicStatus,
      workTypes: filtered.map((c) => ({
        id: c.id,
        workType: c.workType,
        deadlineDays: c.deadlineDays,
        requiresOutsourcing: c.requiresOutsourcing,
        requirements: c.requirements,
        allowedForNew: c.allowedForNew,
      })),
    });
  } catch (e) {
    console.error(e);
    return jsonError(500, "Erro ao carregar tipos de trabalho.");
  }
}
