import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/require-auth";
import { db } from "db";
import { contacts } from "db";
import { eq, and } from "db";

export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.roleName !== "Client" || !auth.contactId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const [contact] = await db
      .select({
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        phone: contacts.phone,
        street: contacts.street,
        city: contacts.city,
        zip: contacts.zip,
      })
      .from(contacts)
      .where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, auth.contactId)))
      .limit(1);
    if (!contact) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email || "",
      phone: contact.phone || "",
      street: contact.street || "",
      city: contact.city || "",
      zip: contact.zip || "",
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
