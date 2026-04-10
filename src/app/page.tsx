import { redirect } from "next/navigation";
import { dashboardPathForRole, getRoleFromUser } from "@/lib/auth-roles";
import { createClient } from "@/lib/supabase-server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const role = getRoleFromUser(user);
  if (!role) {
    redirect("/login");
  }

  redirect(dashboardPathForRole(role));
}
