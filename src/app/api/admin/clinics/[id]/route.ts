import { Prisma, ClinicStatus, UserRole } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

function parseClinicStatus(value: unknown): ClinicStatus | null {
  if (value === "NOVA" || value === "ATIVA") return value;
  return null;
}

function optionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  return t.length ? t : null;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest();
  if (!auth.ok) {
    return jsonError(auth.status, auth.message);
  }
  if (auth.dbUser.role !== UserRole.ADMIN) {
    return jsonError(403, "Apenas administradores podem consultar clínicas.");
  }

  const { id } = await context.params;

  try {
    const clinic = await prisma.clinic.findUnique({
      where: { id },
      include: {
        users: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            createdAt: true,
            updatedAt: true,
            clinicId: true,
          },
        },
        orders: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!clinic) {
      return jsonError(404, "Clínica não encontrada.");
    }

    return NextResponse.json(clinic);
  } catch (e) {
    console.error(e);
    return jsonError(500, "Erro ao carregar a clínica.");
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest();
  if (!auth.ok) {
    return jsonError(auth.status, auth.message);
  }
  if (auth.dbUser.role !== UserRole.ADMIN) {
    return jsonError(403, "Apenas administradores podem atualizar clínicas.");
  }

  const { id } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError(400, "Corpo do pedido inválido (JSON esperado).");
  }

  const allowed: {
    name?: string;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    postalCode?: string | null;
    nif?: string | null;
    status?: ClinicStatus;
  } = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return jsonError(400, "name inválido.");
    }
    allowed.name = body.name.trim();
  }

  if (body.phone !== undefined) {
    const v = optionalString(body.phone);
    if (v === undefined) return jsonError(400, "phone inválido.");
    allowed.phone = v;
  }
  if (body.address !== undefined) {
    const v = optionalString(body.address);
    if (v === undefined) return jsonError(400, "address inválido.");
    allowed.address = v;
  }
  if (body.city !== undefined) {
    const v = optionalString(body.city);
    if (v === undefined) return jsonError(400, "city inválido.");
    allowed.city = v;
  }
  if (body.postalCode !== undefined) {
    const v = optionalString(body.postalCode);
    if (v === undefined) return jsonError(400, "postalCode inválido.");
    allowed.postalCode = v;
  }
  if (body.nif !== undefined) {
    if (typeof body.nif !== "string" || !body.nif.trim()) {
      return jsonError(400, "nif inválido.");
    }
    allowed.nif = body.nif.trim();
  }

  if (body.status !== undefined) {
    const s = parseClinicStatus(body.status);
    if (!s) {
      return jsonError(400, "status inválido (use NOVA ou ATIVA).");
    }
    allowed.status = s;
  }

  if (Object.keys(allowed).length === 0) {
    return jsonError(400, "Nenhum campo permitido para atualizar.");
  }

  try {
    const existing = await prisma.clinic.findUnique({ where: { id } });
    if (!existing) {
      return jsonError(404, "Clínica não encontrada.");
    }

    if (
      existing.status === ClinicStatus.NOVA &&
      allowed.status === ClinicStatus.ATIVA
    ) {
      console.log(
        `[clinic] Estado NOVA → ATIVA (clinicId=${id}, name=${existing.name})`
      );
    }

    const updated = await prisma.clinic.update({
      where: { id },
      data: allowed,
    });

    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return jsonError(
        400,
        "Já existe outro registo com o mesmo email ou NIF."
      );
    }
    console.error(e);
    return jsonError(500, "Erro ao atualizar a clínica.");
  }
}
