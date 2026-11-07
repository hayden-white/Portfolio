import type { Config } from "@netlify/functions";
import { sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { contacts, messages } from "../../db/schema.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const clean = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
};

// Accepts contact form submissions as JSON or standard form-encoded data.
export default async (req: Request) => {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  let input: Record<string, unknown>;
  try {
    const type = req.headers.get("content-type") ?? "";
    input = type.includes("application/json")
      ? await req.json()
      : Object.fromEntries(await req.formData());
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Honeypot: real users leave this hidden field empty
  if (clean(input.website, 200)) {
    return Response.json({ ok: true }, { status: 201 });
  }

  const name = clean(input.name, 200);
  const email = clean(input.email, 320)?.toLowerCase() ?? null;
  const body = clean(input.message, 5000);

  const errors: Record<string, string> = {};
  if (!name) errors.name = "Name is required";
  if (!email || !EMAIL_RE.test(email)) errors.email = "A valid email is required";
  if (!body) errors.message = "Message is required";
  if (Object.keys(errors).length) {
    return Response.json({ error: "Validation failed", errors }, { status: 400 });
  }

  const phone = clean(input.phone, 50);
  const company = clean(input.company, 200);

  try {
    const result = await db.transaction(async (tx) => {
      // Create the contact, or refresh details if this email has written before
      const [contact] = await tx
        .insert(contacts)
        .values({ name: name!, email: email!, phone, company })
        .onConflictDoUpdate({
          target: contacts.email,
          set: {
            name: name!,
            phone: sql`coalesce(${phone}, ${contacts.phone})`,
            company: sql`coalesce(${company}, ${contacts.company})`,
            updatedAt: new Date(),
          },
        })
        .returning({ id: contacts.id });

      const [message] = await tx
        .insert(messages)
        .values({
          contactId: contact.id,
          subject: clean(input.subject, 300),
          body: body!,
          source: clean(input.source, 500),
        })
        .returning({ id: messages.id });

      return { contactId: contact.id, messageId: message.id };
    });

    return Response.json({ ok: true, ...result }, { status: 201 });
  } catch (err) {
    console.error("Failed to save contact submission", err);
    return Response.json({ error: "Could not save your message" }, { status: 500 });
  }
};

export const config: Config = {
  path: "/api/contact",
};
