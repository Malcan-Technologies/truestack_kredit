import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth-server";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const prisma = new PrismaClient();

const registerSchema = z.object({
  tenantName: z.string().min(2).max(100),
  tenantSlug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  tenantType: z.enum(["PPW", "PPG"], { required_error: "License type is required" }),
  licenseNumber: z.string().min(1).max(50),
  registrationNumber: z.string().min(1).max(50),
  tenantEmail: z.string().email(),
  contactNumber: z.string().min(1).max(20),
  businessAddress: z.string().min(1).max(500),
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2).max(100).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = registerSchema.parse(body);

    // Check if tenant slug already exists
    const existingTenant = await prisma.tenant.findUnique({
      where: { slug: data.tenantSlug },
    });

    if (existingTenant) {
      return NextResponse.json(
        { error: "Tenant slug already exists" },
        { status: 409 }
      );
    }

    // Check if user email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 409 }
      );
    }

    // Create tenant in a transaction
    const tenant = await prisma.$transaction(async (tx) => {
      // Create tenant
      const newTenant = await tx.tenant.create({
        data: {
          name: data.tenantName,
          slug: data.tenantSlug,
          type: data.tenantType,
          licenseNumber: data.licenseNumber,
          registrationNumber: data.registrationNumber,
          email: data.tenantEmail,
          contactNumber: data.contactNumber,
          businessAddress: data.businessAddress,
          status: "ACTIVE",
        },
      });

      // Create initial subscription (30 days trial)
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setDate(periodEnd.getDate() + 30);

      await tx.subscription.create({
        data: {
          tenantId: newTenant.id,
          plan: "trial",
          status: "ACTIVE",
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      });

      return newTenant;
    });

    // Sign up user with Better Auth (this creates the user and credential account)
    const signUpResult = await auth.api.signUpEmail({
      body: {
        email: data.email,
        password: data.password,
        name: data.name || data.email.split("@")[0],
      },
    });

    if (!signUpResult || !signUpResult.user) {
      // Rollback tenant creation if user signup fails
      await prisma.tenant.delete({ where: { id: tenant.id } });
      return NextResponse.json(
        { error: "Failed to create user account" },
        { status: 500 }
      );
    }

    // Create membership for the owner
    await prisma.tenantMember.create({
      data: {
        userId: signUpResult.user.id,
        tenantId: tenant.id,
        role: "OWNER",
        isActive: true,
      },
    });

    // Update the session with active tenant
    if (signUpResult.session?.token) {
      await prisma.session.update({
        where: { token: signUpResult.session.token },
        data: { activeTenantId: tenant.id },
      });
    }

    // Return the session with cookies
    const response = NextResponse.json({
      success: true,
      data: {
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
        },
        user: {
          id: signUpResult.user.id,
          email: signUpResult.user.email,
          name: signUpResult.user.name,
        },
      },
    });

    // Copy session cookies from Better Auth response if available
    if (signUpResult.headers) {
      const setCookieHeader = signUpResult.headers.get("set-cookie");
      if (setCookieHeader) {
        response.headers.set("set-cookie", setCookieHeader);
      }
    }

    return response;
  } catch (error) {
    console.error("Registration error:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0]?.message || "Validation failed" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Registration failed" },
      { status: 500 }
    );
  }
}
