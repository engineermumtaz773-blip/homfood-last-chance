import type { SmsMessage, SmsProvider } from "@/lib/sms/provider";

export class TextBeeSmsProvider implements SmsProvider {
  async send({ recipient, message }: SmsMessage) {
    const apiKey = process.env.TEXTBEE_API_KEY;
    if (!apiKey) throw new Error("SMS verification is not configured. Please contact support.");
    const deviceId = process.env.TEXTBEE_DEVICE_ID;
    let response: Response;
    try {
      response = await fetch("https://api.textbee.dev/api/v1/gateway/send-sms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          recipients: [recipient],
          message,
          ...(deviceId ? { deviceId } : {}),
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
      throw new Error(response.status >= 500
        ? "SMS delivery is temporarily unavailable. Please try again shortly."
        : "SMS provider rejected the request. Please try again later.");
    }
  }
}
