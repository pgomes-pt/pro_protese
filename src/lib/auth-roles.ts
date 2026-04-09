export type UserRole = "ADMIN" | "CLINICA" | "ESTAFETA";

export function getRoleFromUser(user: {
  user_metadata?: Record<string, unknown>;
}): UserRole | undefined {
  const raw = user.user_metadata?.role;
  if (raw === "ADMIN" || raw === "CLINICA" || raw === "ESTAFETA") {
    return raw;
  }
  return undefined;
}

export function dashboardPathForRole(role: UserRole): string {
  switch (role) {
    case "ADMIN":
      return "/admin";
    case "CLINICA":
      return "/dashboard/clinica";
    case "ESTAFETA":
      return "/dashboard/estafeta";
  }
}
