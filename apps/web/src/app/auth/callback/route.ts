import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveAccountRole } from "@/lib/roles";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const errorDesc = searchParams.get("error_description") || searchParams.get("error");
  const requestedAccountType = searchParams.get("accountType");

  if (errorDesc) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(errorDesc)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_oauth_code`);
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.redirect(`${origin}/login?error=supabase_not_configured`);
  }

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error?.message || "oauth_exchange_failed")}`
    );
  }

  const user = data.user;
  const existingType = user.user_metadata?.account_type as string | undefined;
  const resolvedRole = resolveAccountRole(
    user.email,
    requestedAccountType || existingType
  );

  // Persist the resolved role into Supabase user_metadata so it stays consistent everywhere
  if (existingType !== resolvedRole) {
    await supabase.auth.updateUser({
      data: {
        account_type: resolvedRole,
        role_title:
          user.user_metadata?.role_title ||
          (resolvedRole === "admin"
            ? "Platform Administrator"
            : resolvedRole === "org"
            ? "Organization Hiring Lead"
            : "Individual Candidate"),
        organization:
          user.user_metadata?.organization ||
          (resolvedRole === "admin"
            ? "VeriSphere Core Admin"
            : resolvedRole === "org"
            ? "Organization Workspace"
            : "Personal Account"),
      },
    });
  }

  const provider = user.app_metadata?.provider || "oauth";
  const targetPath =
    resolvedRole === "org" || resolvedRole === "admin"
      ? `/dashboard?welcome=${encodeURIComponent(provider)}`
      : `/profile?welcome=${encodeURIComponent(provider)}`;

  return NextResponse.redirect(`${origin}${targetPath}`);
}
