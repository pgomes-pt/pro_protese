import { Prisma, ClinicStatus, UserRole } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getSupabaseServiceClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

function parseClinicStatus(value: unknown): ClinicStatus | null {
  if (value === "NOVA" || value === "ATIVA") return value;
  return null;
}

function requireString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length ? t : null;
}

export async function GET() {
  const auth = await authenticateRequest();
  if (!auth.ok) {
    return jsonError(auth.status, auth.message);
  }
  if (auth.dbUser.role !== UserRole.ADMIN) {
    return jsonError(403, "Apenas administradores podem listar clínicas.");
  }

  try {
    const clinics = await prisma.clinic.findMany({
      orderBy: { createdAt: "desc" },
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
        _count: { select: { orders: true } },
      },
    });

    return NextResponse.json(clinics);
  } catch (e) {
    console.error(e);
    return jsonError(500, "Erro ao listar clínicas.");
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest();
  if (!auth.ok) {
    return jsonError(auth.status, auth.message);
  }
  if (auth.dbUser.role !== UserRole.ADMIN) {
    return jsonError(403, "Apenas administradores podem criar clínicas.");
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError(400, "Corpo do pedido inválido (JSON esperado).");
  }

  const clinicName = requireString(body.clinicName);
  const email = requireString(body.email)?.toLowerCase() ?? null;
  const password = typeof body.password === "string" ? body.password : "";
  const nif = requireString(body.nif);
  const phone = body.phone != null ? requireString(body.phone) : null;
  const address = body.address != null ? requireString(body.address) : null;
  const city = body.city != null ? requireString(body.city) : null;
  const postalCode =
    body.postalCode != null ? requireString(body.postalCode) : null;
  const statusRaw = body.status;
  const status =
    statusRaw === undefined || statusRaw === null
      ? ClinicStatus.NOVA
      : parseClinicStatus(statusRaw);

  if (!clinicName) {
    return jsonError(400, "clinicName é obrigatório.");
  }
  if (!email || !email.includes("@")) {
    return jsonError(400, "email é obrigatório e deve ser válido.");
  }
  if (password.length < 6) {
    return jsonError(400, "A palavra-passe deve ter pelo menos 6 caracteres.");
  }
  if (!nif) {
    return jsonError(400, "nif é obrigatório.");
  }
  if (!status) {
    return jsonError(400, "status inválido (use NOVA ou ATIVA).");
  }

  const supabaseAdmin = getSupabaseServiceClient();
  if (!supabaseAdmin) {
    return jsonError(
      500,
      "Serviço de autenticação não configurado (SUPABASE_SERVICE_ROLE_KEY)."
    );
  }

  let clinic;
  try {
    clinic = await prisma.clinic.create({
      data: {
        name: clinicName,
        email,
        phone: phone ?? undefined,
        address: address ?? undefined,
        city: city ?? undefined,
        postalCode: postalCode ?? undefined,
        nif,
        status,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return jsonError(
        400,
        "Já existe uma clínica ou registo com o mesmo email ou NIF."
      );
    }
    console.error(e);
    return jsonError(500, "Erro ao criar a clínica.");
  }

  const { data: created, error: createError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role: "CLINICA",
        name: clinicName,
      },
    });

  if (createError || !created.user) {
    await prisma.clinic.delete({ where: { id: clinic.id } }).catch(() => {});
    const msg =
      createError?.message ?? "Falha ao criar utilizador no Supabase.";
    return jsonError(400, msg);
  }

  const authId = created.user.id;

  try {
    const user = await prisma.user.create({
      data: {
        id: authId,
        email,
        name: clinicName,
        role: UserRole.CLINICA,
        clinicId: clinic.id,
      },
    });

    return NextResponse.json({
      clinic,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        clinicId: user.clinicId,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (e) {
    await supabaseAdmin.auth.admin.deleteUser(authId).catch(() => {});
    await prisma.clinic.delete({ where: { id: clinic.id } }).catch(() => {});
    console.error(e);
    return jsonError(
      500,
      "Erro ao criar o utilizador na base de dados. As alterações foram revertidas."
    );
  }
}
