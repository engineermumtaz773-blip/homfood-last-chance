import "server-only";
import nodemailer from "nodemailer";

const adminEmail = "engineermumtaz773@gmail.com";
const fromAddress = process.env.HMF_ADMIN_OTP_FROM_EMAIL?.trim();

export function isAdminOtpMailerConfigured() {
  const port = Number.parseInt(process.env.SMTP_PORT ?? "", 10);
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
    Number.isInteger(port) && port > 0 && port < 65_536 &&
    process.env.SMTP_USER?.trim() &&
    process.env.SMTP_PASS &&
    fromAddress,
  );
}

function getTransporter() {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number.parseInt(process.env.SMTP_PORT ?? "", 10);
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASS;
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const sender = process.env.HMF_ADMIN_OTP_FROM_EMAIL?.trim();

  if (!host || !Number.isInteger(port) || port < 1 || port > 65_535 || !user || !password || !sender) {
    throw new Error("SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and HMF_ADMIN_OTP_FROM_EMAIL must be configured.");
  }
  if (/\r|\n/.test(host) || /\r|\n/.test(user) || /[\r\n<>]/.test(sender) ||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(sender)) {
    throw new Error("The configured admin OTP mailer values are invalid.");
  }
  if (host.toLowerCase() === "smtp.gmail.com" && sender.toLowerCase() !== user.toLowerCase()) {
    throw new Error("For Gmail SMTP, HMF_ADMIN_OTP_FROM_EMAIL must match SMTP_USER.");
  }

  return {
    from: sender,
    transporter: nodemailer.createTransport({
      host,
      port,
      secure,
      requireTLS: !secure,
      auth: { user, pass: password },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 12000,
      tls: { minVersion: "TLSv1.2" },
    }),
  };
}

export async function sendAdminOtpEmail(code: string) {
  if (!/^\d{6}$/.test(code)) throw new Error("The admin verification code must be six digits.");

  const html = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;background:#f4f6f2;color:#1f2933;font-family:Arial,Helvetica,sans-serif">
    <div style="padding:36px 16px">
      <div style="max-width:560px;margin:0 auto;border:1px solid #e4e9e1;border-radius:20px;background:#ffffff;overflow:hidden">
        <div style="padding:28px 32px;background:linear-gradient(135deg, #0d261a 0%, #173f2b 100%);color:#ffffff">
          <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin-bottom:12px;">
            <tr>
              <td style="vertical-align:middle;padding-right:12px;">
                <img src="https://homefood.engineer/image_6c70d8.jpg" alt="Home Made Food Logo" width="44" height="44" style="border-radius:50%;border:2px solid #86efac;box-shadow:0 0 12px rgba(134,239,172,0.5);display:block;" />
              </td>
              <td style="vertical-align:middle;">
                <div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#86efac">HOME MADE FOOD</div>
                <div style="color:#b8d8c2;font-size:10px;font-weight:600;letter-spacing:1px;margin-top:2px;">ADMIN SECURITY</div>
              </td>
            </tr>
          </table>

          <h1 style="margin:13px 0 0;font-size:24px;line-height:1.3">Verify your admin sign-in</h1>
        </div>
        <div style="padding:32px">
          <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#46534a">Use the one-time verification code below to finish signing in to the Home Made Food admin portal.</p>
          <div style="margin:24px 0;padding:19px 16px;border:1px solid #dfe9df;border-radius:14px;background:#f7faf6;text-align:center">
            <div style="margin-bottom:8px;font-size:11px;font-weight:700;letter-spacing:1.8px;color:#66736a;text-transform:uppercase">Your verification code</div>
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:34px;font-weight:700;letter-spacing:10px;color:#173f2b">${code}</div>
          </div>
          <p style="margin:0;font-size:13px;line-height:1.7;color:#66736a">This code expires in 5 minutes and can be used once. Never share it with anyone. If you did not request this sign-in, you can safely ignore this message.</p>
        </div>
        <div style="padding:18px 32px;border-top:1px solid #edf0eb;font-size:11px;line-height:1.6;color:#849087">Automated security message from Home Made Food. Replies to this email are not monitored.</div>
      </div>
    </div>
  </body>
</html>`;
  const text = `Home Made Food admin sign-in\n\nYour verification code is ${code}.\n\nThis code expires in 5 minutes and can be used once. Never share it. If you did not request this sign-in, ignore this email.`;
  const { from, transporter } = getTransporter();
  try {
    const result = await transporter.sendMail({
      from: { name: "Home Made Food Security", address: from },
      to: adminEmail,
      subject: "Your Home Made Food admin verification code",
      html,
      text,
      headers: { "X-Auto-Response-Suppress": "All" },
    });
    const accepted = result.accepted.some((recipient) => recipient.toLowerCase() === adminEmail);
    if (!accepted) {
      throw new Error("The SMTP server did not accept the authorized admin recipient.");
    }
  } finally {
    transporter.close();
  }
}
