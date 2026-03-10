import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const dbUrl = process.env.DATABASE_URL || "NOT SET";
    const host = dbUrl.includes("@") ? dbUrl.split("@")[1]?.split("/")[0] : "unknown";
    
    const companiesCount = await prisma.company.count();
    const complexesCount = await prisma.complex.count();
    const usersCount = await prisma.user.count();
    const apartmentsCount = await prisma.apartment.count();
    
    return NextResponse.json({
      db_host: host,
      is_digitalocean: host.includes("ondigitalocean"),
      is_atlas: host.includes("mongodb.net"),
      counts: {
        companies: companiesCount,
        complexes: complexesCount,
        users: usersCount,
        apartments: apartmentsCount,
      }
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
