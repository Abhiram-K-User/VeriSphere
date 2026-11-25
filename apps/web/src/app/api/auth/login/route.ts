import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { setSessionCookie, SessionUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const mode = body.mode === "signup" ? "signup" : "signin";
    const nameInput = typeof body.name === "string" ? body.name.trim() : "";
    const requestedType = body.accountType === "org" ? "org" : "individual";
    // Admin defaults to individual unless explicitly switched; honour explicit selection
    const accountType: "individual" | "org" =
      body.accountType === "org" || body.accountType === "individual"
        ? requestedType
        : "individual";

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters." },
        { status: 400 }
      );
    }

    if (mode === "signin") {
      // Demo admin credentials check
      if (email === "admin@verisphere.ai" && password !== "password") {
        return NextResponse.json(
          { error: "Invalid credentials. Use admin@verisphere.ai / password" },
          { status: 401 }
        );
      }
    }

    const displayName =
      nameInput ||
      (email === "admin@verisphere.ai"
        ? "VeriSphere Admin"
        : email
            .split("@")[0]
            .replace(/[._-]+/g, " ")
            .replace(/\b\w/g, (c: string) => c.toUpperCase()));

    const user: SessionUser = {
      id: `usr_${crypto.createHash("sha256").update(email).digest("hex").slice(0, 12)}`,
      name: displayName,
      email,
      provider: "credentials",
      accountType,
      role:
        accountType === "org"
          ? "Organization Hiring Lead"
          : email === "admin@verisphere.ai"
          ? "Individual Candidate (Admin)"
          : "Individual Candidate",
      organization:
        accountType === "org" ? "VeriSphere Enterprise Org" : "Personal Account",
      signedInAt: new Date().toISOString(),
    };

    await setSessionCookie(user);

    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 });
  }
}

