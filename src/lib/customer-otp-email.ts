import "server-only";
import nodemailer from "nodemailer";

export type SmtpConfig = {
  isConfigured: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
};

export function getSmtpConfig(): SmtpConfig {
  const user = (
    process.env.SMTP_USER ||
    process.env.GMAIL_USER ||
    process.env.EMAIL_USER ||
    process.env.MAIL_USERNAME ||
    "engineermumtaz773@gmail.com"
  ).trim();

  const rawPass = (
    process.env.SMTP_PASS ||
    process.env.SMTP_PASSWORD ||
    process.env.GMAIL_PASS ||
    process.env.GMAIL_APP_PASSWORD ||
    process.env.EMAIL_PASSWORD ||
    process.env.MAIL_PASSWORD ||
    ""
  ).trim();

  // Strip all whitespace from App Password (e.g. "abcd efgh ijkl mnop" -> "abcdefghijklmnop")
  const pass = rawPass.replace(/\s+/g, "");

  const host = (
    process.env.SMTP_HOST ||
    process.env.MAIL_HOST ||
    (user.toLowerCase().endsWith("@gmail.com") ? "smtp.gmail.com" : "")
  ).trim();

  const port = Number.parseInt(process.env.SMTP_PORT || "465", 10) || 465;
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const from = (
    process.env.HMF_ADMIN_OTP_FROM_EMAIL ||
    process.env.EMAIL_FROM ||
    user ||
    "Home Made Food <no-reply@homemadefood.pk>"
  ).trim();

  const isConfigured = Boolean(user && pass && pass.length >= 8);

  return { isConfigured, host, port, secure, user, pass, from };
}

function createTransporter(config: SmtpConfig) {
  const isGmail = config.host === "smtp.gmail.com" || config.user.toLowerCase().endsWith("@gmail.com");

  if (isGmail) {
    return nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: config.user,
        pass: config.pass,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });
  }

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    tls: {
      minVersion: "TLSv1.2",
      rejectUnauthorized: false,
    },
  });
}

export function generateCustomerOtpEmailHtml(code: string, customerName?: string): string {
  const greeting = customerName ? `Hello <strong>${customerName}</strong>,` : "Hello Valued Customer,";
  
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your Home Made Food Verification Code</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f4f7f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;-webkit-font-smoothing:antialiased;">
    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f4f7f4;padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:560px;background-color:#ffffff;border-radius:24px;border:1px solid #e2e8f0;overflow:hidden;box-shadow:0 12px 32px rgba(15,23,42,0.06);">
            
            <!-- Luxury Emerald Brand Header -->
            <tr>
              <td style="background:linear-gradient(135deg, #0d261a 0%, #173f2b 100%);padding:36px 36px 32px 36px;text-align:center;">
                <div style="margin-bottom:14px;">
                  <img src="https://homefood.engineer/image_6c70d8.jpg" alt="Home Made Food" width="60" height="60" style="border-radius:50%;border:2px solid #86efac;box-shadow:0 0 16px rgba(134,239,172,0.5);display:inline-block;" />
                </div>
                <div style="font-size:11px;font-weight:800;letter-spacing:3px;text-transform:uppercase;color:#86efac;margin-bottom:10px;">
                  HOME MADE FOOD · BAHAWALPUR
                </div>
                <h1 style="margin:0;font-size:26px;font-weight:800;color:#ffffff;line-height:1.2;letter-spacing:-0.4px;">
                  Verify Your Account
                </h1>
                <p style="margin:8px 0 0 0;font-size:14px;color:#cbd5e1;line-height:1.5;">
                  Your secure 6-digit one-time verification passkey
                </p>
              </td>
            </tr>

            <!-- Content Body -->
            <tr>
              <td style="padding:36px 36px 28px 36px;">
                <p style="margin:0 0 16px 0;font-size:16px;line-height:1.6;color:#1e293b;">
                  ${greeting}
                </p>
                <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#475569;">
                  Thank you for dining with <strong>Home Made Food Bahawalpur</strong>. Use the 6-digit verification code below to verify your email address and activate your customer account.
                </p>

                <!-- High-End 6-Digit OTP Box -->
                <div style="margin:30px 0;padding:26px 20px;background:linear-gradient(180deg, #f0fdf4 0%, #ecfdf5 100%);border:2px dashed #86efac;border-radius:20px;text-align:center;">
                  <div style="font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#166534;margin-bottom:10px;">
                    YOUR 6-DIGIT VERIFICATION CODE
                  </div>
                  <div style="font-family:'Courier New',Courier,monospace,sans-serif;font-size:40px;font-weight:800;letter-spacing:14px;color:#14532d;padding-left:14px;">
                    ${code}
                  </div>
                  <div style="margin-top:12px;font-size:12px;color:#15803d;font-weight:600;">
                    ⏱ Valid for 10 minutes · Single-use passkey
                  </div>
                </div>

                <!-- Security Guidance -->
                <div style="background-color:#f8fafc;border-radius:16px;padding:18px 20px;margin-bottom:24px;border:1px solid #f1f5f9;">
                  <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:8px;">
                    Important Security Instructions:
                  </div>
                  <ul style="margin:0;padding-left:20px;font-size:13px;line-height:1.6;color:#64748b;">
                    <li>Never share this code with anyone, including delivery riders or staff.</li>
                    <li>Account access and checkout are locked until this verification is completed.</li>
                    <li>If you did not request this verification, please disregard this message.</li>
                  </ul>
                </div>

                <!-- Support Contacts -->
                <div style="border-top:1px solid #f1f5f9;padding-top:20px;font-size:13px;line-height:1.6;color:#64748b;">
                  Need help with your order or delivery? Our Bahawalpur kitchen team is available:
                  <div style="margin-top:8px;">
                    📞 Phone: <a href="tel:03096648932" style="color:#16a34a;text-decoration:none;font-weight:700;">0309 6648932</a> &nbsp;|&nbsp;
                    💬 WhatsApp: <a href="https://wa.me/923040537000" style="color:#16a34a;text-decoration:none;font-weight:700;">+92 304 0537000</a>
                  </div>
                </div>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:22px 36px;background-color:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
                <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.6;">
                  Home Made Food · Model Town &amp; University Road, Bahawalpur, Punjab, Pakistan<br>
                  This is an automated security transmission. Replies are not monitored.
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function sendCustomerOtpEmail(
  email: string,
  code: string,
  customerName?: string
): Promise<{
  success: boolean;
  delivered?: boolean;
  simulated?: boolean;
  devCode?: string;
  error?: string;
}> {
  if (!/^\d{6}$/.test(code)) {
    throw new Error("Verification code must be exactly 6 digits.");
  }

  const cleanEmail = email.trim().toLowerCase();
  const config = getSmtpConfig();

  // If SMTP credentials (user and app password) are present, attempt live email delivery
  if (config.isConfigured) {
    try {
      const transporter = createTransporter(config);
      const html = generateCustomerOtpEmailHtml(code, customerName);
      const text = `Home Made Food - Verification Code\n\nYour 6-digit verification code is: ${code}\n\nThis code expires in 10 minutes. Never share it with anyone.\nHome Made Food Bahawalpur · Phone: 0309 6648932`;

      const result = await transporter.sendMail({
        from: { name: "Home Made Food Security", address: config.from },
        to: cleanEmail,
        subject: `Your Verification Code: ${code} - Home Made Food`,
        html,
        text,
        headers: { "X-Auto-Response-Suppress": "All" },
      });

      console.log(`[SMTP_SUCCESS] Live OTP email successfully sent to ${cleanEmail}. MessageId: ${result.messageId}`);
      return { success: true, delivered: true };
    } catch (smtpErr) {
      console.error("[SMTP_ERROR] Live email delivery encountered an error:", smtpErr);
      // Fall through to dev helper below
    }
  } else {
    console.warn(`[SMTP_NOTICE] SMTP credentials not fully configured in .env.local (SMTP_USER=${config.user}, PASS_LENGTH=${config.pass.length}). Falling back to development passkey.`);
  }

  // Graceful fallback for local dev when SMTP is pending Google App Password
  console.log("=================================================");
  console.log(`[CUSTOMER AUTH OTP PASSKEY] Email: ${cleanEmail}`);
  console.log(`[CUSTOMER AUTH OTP PASSKEY] Code:  ${code}`);
  console.log("=================================================");

  return {
    success: true,
    simulated: true,
    devCode: code,
  };
}
