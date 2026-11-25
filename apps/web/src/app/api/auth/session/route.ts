import { NextRequest, NextResponse } from "next/server";
import {
  getServerSession,
  setSessionCookie,
  getConfiguredOAuthProviders,
} from "@/lib/auth";

export async function GET() {
  const user = await getServerSession();
  const providers = getConfiguredOAuthProviders();
  return NextResponse.json({ user, providers });
}

export async function PATCH(req: NextRequest) {
  const currentUser = await getServerSession();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const updatedUser = {
      ...currentUser,
      accountType:
        body.accountType === "org" || body.accountType === "individual"
          ? body.accountType
          : currentUser.accountType || "individual",
      name:
        typeof body.name === "string" && body.name.trim().length > 0
          ? body.name.trim().slice(0, 80)
          : currentUser.name,
      role:
        typeof body.role === "string" && body.role.trim().length > 0
          ? body.role.trim().slice(0, 60)
          : currentUser.role,
      organization:
        typeof body.organization === "string" && body.organization.trim().length > 0
          ? body.organization.trim().slice(0, 80)
          : currentUser.organization,
    };

    await setSessionCookie(updatedUser);
    return NextResponse.json({ user: updatedUser });
  } catch {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }
}

