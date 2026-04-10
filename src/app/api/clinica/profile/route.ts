import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  const auth = await authenticateRequest();
  if (!auth.ok) {
    return jsonError(auth.status, auth.message);
  }
  if (auth.dbUser.role !== UserRole.CLINICA) {
    return jsonError(403, "Apenas contas de clínica podem consultar este perfil.");
  }
  if (!auth.dbUser.clinicId) {
    return jsonError(403, "Conta de clínica sem clínica associada.");
  }

  try {
    const clinic = await prisma.clinic.findUnique({
      where: { id: auth.dbUser.clinicId },
    });

    if (!clinic) {
      return jsonError(404, "Clínica não encontrada.");
    }

    return NextResponse.json(clinic);
  } catch (e) {
    console.error(e);
    return jsonError(500, "Erro ao carregar o perfil da clínica.");
  }
}
