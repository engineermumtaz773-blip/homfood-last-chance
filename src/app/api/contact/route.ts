import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { getSmtpConfig } from "@/lib/customer-otp-email";
import { isSameOriginAdminRequest } from "@/lib/admin-auth-security";

export const runtime = "nodejs";

const supportEmail = "ch.arslan4367@gmail.com";

export async function POST(request: Request) {
  if (!isSameOriginAdminRequest(request)) {
    return NextResponse.json({ error: "Please submit this form from the Home Made Food website." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a valid message request." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Send a valid message request." }, { status: 400 });
  }

  const values = body as { name?: unknown; phone?: unknown; message?: unknown; website?: unknown };
  // Quietly accept the form response while ignoring automated honeypot submissions.
  if (typeof values.website === "string" && values.website.trim()) {
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  }
  const name = typeof values.name === "string" ? values.name.trim() : "";
  const phone = typeof values.phone === "string" ? values.phone.trim() : "";
  const message = typeof values.message === "string" ? values.message.trim() : "";
  if (name.length < 2 || name.length > 80 || !/^[+\d() -]{7,24}$/.test(phone) || message.length < 2 || message.length > 2000) {
    return NextResponse.json({ error: "Enter a name, valid phone number, and a message under 2,000 characters." }, { status: 400 });
  }

  const smtp = getSmtpConfig();
  if (!smtp.isConfigured || !smtp.host) {
    return NextResponse.json({ error: "Email delivery is not configured right now. Please use WhatsApp or the email button." }, { status: 503 });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass },
      connectionTimeout: 8_000,
      greetingTimeout: 8_000,
      socketTimeout: 12_000,
    });
    await transporter.sendMail({
      from: smtp.from,
      to: supportEmail,
      replyTo: smtp.user,
      subject: `Home Made Food website message from ${name}`,
      text: `Name: ${name}\nPhone: ${phone}\n\nMessage:\n${message}`,
    });
    return NextResponse.json({ ok: true, message: "Your message was sent to the Home Made Food team." }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[CONTACT_EMAIL_ERROR]", error);
    return NextResponse.json({ error: "Your message could not be sent. Please try again or use WhatsApp." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
