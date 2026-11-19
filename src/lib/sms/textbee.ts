import type { SmsMessage, SmsProvider } from "@/lib/sms/provider";
import { normalizePakistaniPhone } from "@/lib/phone";

export class TextBeeSmsProvider implements SmsProvider {
  async send({ recipient, message }: SmsMessage) {
    const apiKey = process.env.TEXTBEE_API_KEY?.trim();
    if (!apiKey) throw new Error("SMS verification is not configured. Set TEXTBEE_API_KEY.");
    const deviceId = process.env.TEXTBEE_DEVICE_ID?.trim();
    if (!deviceId) throw new Error("SMS verification is not configured. Set TEXTBEE_DEVICE_ID and try again.");
    const normalizedRecipient = normalizePakistaniPhone(recipient);
    if (!normalizedRecipient) throw new Error("Enter a valid Pakistani mobile number in +92 format.");
    let response: Response;
    try {
      response = await fetch(`https://api.textbee.dev/api/v1/gateway/devices/${encodeURIComponent(deviceId)}/send-sms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          recipients: [normalizedRecipient],
          message,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      });
    } catch (error) {
      console.error("[TEXTBEE_REQUEST_FAILED]", error);
      throw new Error("SMS delivery is temporarily unavailable. Please try again shortly.");
    }
    if (response.status === 429) {
      throw new Error("SMS service is rate limited. Please wait before requesting another code.");
    }
    if (!response.ok) {
      const responseText = await response.text();
      let providerMessage = "";
      try {
        const body = JSON.parse(responseText) as { message?: unknown; error?: unknown; detail?: unknown };
        providerMessage = [body.message, body.error, body.detail]
          .find((value): value is string => typeof value === "string" && value.trim().length > 0)
          ?.replace(/[\u0000-\u001f\u007f]/g, " ")
          .slice(0, 220) || "";
      } catch {
        providerMessage = "";
      }
      if (response.status >= 500) {
        throw new Error("SMS delivery is temporarily unavailable. Please try again shortly.");
      }
      throw new Error(`SMS provider rejected the request (HTTP ${response.status})${providerMessage ? `: ${providerMessage}` : ". Check the TextBee device, API key, and recipient format."}`);
    }
  }
}
