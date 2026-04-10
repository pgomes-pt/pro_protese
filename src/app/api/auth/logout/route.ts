import { createClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

async function signOutAndRedirect(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const url = new URL("/login", request.url);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  return signOutAndRedirect(request);
}

export async function POST(request: Request) {
  return signOutAndRedirect(request);
}
