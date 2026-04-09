import type { User as SupabaseUser } from "@supabase/supabase-js";
import { UserRole } from "@prisma/client";
import { createClient } from "@/lib/supabase-server";
import { prisma } from "@/lib/prisma";

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

export async function authenticateRequest(): Promise<AuthResult> {
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
}
