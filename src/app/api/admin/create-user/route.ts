import { UserRole } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getSupabaseServiceClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const ROLES: readonly UserRole[] = ["ADMIN", "CLINICA", "ESTAFETA"];

function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

function parseRole(value: unknown): UserRole | null {
  if (typeof value !== "string") return null;
  return ROLES.includes(value as UserRole) ? (value as UserRole) : null;
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError(400, "Corpo inválido (JSON esperado).");
  }

  const userCount = await prisma.user.count();
  const isBootstrap = userCount === 0;

  if (!isBootstrap) {
    const auth = await authenticateRequest();
    if (!auth.ok) {
      return jsonError(auth.status, auth.message);
    }
    if (auth.dbUser.role !== UserRole.ADMIN) {
      return jsonError(403, "Apenas administradores podem criar utilizadores.");
    }
  }

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const role = parseRole(body.role);
  const clinicId =
    typeof body.clinicId === "string" && body.clinicId.trim()
      ? body.clinicId.trim()
      : null;

  if (!email || !email.includes("@")) {
    return jsonError(400, "Email inválido ou em falta.");
  }
  if (password.length < 6) {
    return jsonError(400, "A palavra-passe deve ter pelo menos 6 caracteres.");
  }
  if (!name) {
    return jsonError(400, "O nome é obrigatório.");
  }
  if (!role) {
    return jsonError(400, "Perfil (role) inválido ou em falta.");
  }

  if (role === UserRole.CLINICA) {
    if (!clinicId) {
      return jsonError(400, "clinicId é obrigatório para utilizadores de clínica.");
    }
    const clinic = await prisma.clinic.findUnique({ where: { id: clinicId } });
    if (!clinic) {
      return jsonError(400, "Clínica não encontrada.");
    }
  }

  const supabaseAdmin = getSupabaseServiceClient();
  if (!supabaseAdmin) {
    return jsonError(
      500,
      "Serviço de autenticação não configurado (SUPABASE_SERVICE_ROLE_KEY)."
    );
  }

  const { data: created, error: createError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role,
        name,
      },
    });

  if (createError || !created.user) {
    const msg = createError?.message ?? "Falha ao criar utilizador no Supabase.";
    return jsonError(400, msg);
  }

  const authId = created.user.id;

  try {
    const dbUser = await prisma.user.create({
      data: {
        id: authId,
        email,
        name,
        role,
        clinicId: role === UserRole.CLINICA ? clinicId : null,
      },
    });

    return NextResponse.json({
      user: {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        role: dbUser.role,
        clinicId: dbUser.clinicId,
        createdAt: dbUser.createdAt,
        updatedAt: dbUser.updatedAt,
      },
    });
  } catch (e) {
    await supabaseAdmin.auth.admin.deleteUser(authId);
    console.error(e);
    return jsonError(
      500,
      "Erro ao criar o registo na base de dados. O utilizador Supabase foi revertido."
    );
  }
}
