import type { User as SupabaseUser } from "@supabase/supabase-js";
import { Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase-server";

export type AuthenticatedDbUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  clinicId: string | null;
};

export type AuthResult =
  | { ok: true; supabaseUser: SupabaseUser; dbUser: AuthenticatedDbUser }
  | { ok: false; status: number; message: string };

function authFailureMessage(e: unknown): string {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    return `Erro na base de dados (${e.code}).`;
  }
  if (e instanceof Prisma.PrismaClientInitializationError) {
    const base =
      "Não foi possível ligar à base de dados. Verifique DATABASE_URL (Supabase: use o pooler com ?pgbouncer=true ou DIRECT_URL para migrate).";
    return process.env.NODE_ENV === "development"
      ? `${base} Detalhe: ${e.message}`
      : base;
  }
  if (e instanceof Prisma.PrismaClientRustPanicError) {
    return "Erro interno do cliente da base de dados.";
  }
  if (e instanceof Error) {
    if (
      e.message.includes("Missing NEXT_PUBLIC_SUPABASE") ||
      e.message.includes("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
    ) {
      return "Configuração Supabase em falta (variáveis de ambiente).";
    }
    if (process.env.NODE_ENV === "development") {
      return e.message;
    }
  }
  return "Erro interno ao validar a sessão.";
}

/**
 * Uses {@link createClient} from supabase-server so cookie read/write stays on one
 * `cookies()` store. Mixing `request.cookies` for reads with `cookies()` for writes
 * can break `@supabase/ssr` and surface as generic 500s.
 */
export async function authenticateRequest(): Promise<AuthResult> {
  try {
    const supabase = await createClient();

    const {
      data: { user: supabaseUser },
    } = await supabase.auth.getUser();

    if (!supabaseUser?.email) {
      return { ok: false, status: 401, message: "Sessão inválida ou expirada." };
    }

    const dbUser = await prisma.user.findUnique({
      where: { email: supabaseUser.email },
    });

    if (!dbUser) {
      return {
        ok: false,
        status: 403,
        message: "Utilizador não encontrado na base de dados.",
      };
    }

    return {
      ok: true,
      supabaseUser,
      dbUser: {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        role: dbUser.role,
        clinicId: dbUser.clinicId,
      },
    };
  } catch (e) {
    console.error("[authenticateRequest]", e);
    return {
      ok: false,
      status: 500,
      message: authFailureMessage(e),
    };
  }
}
