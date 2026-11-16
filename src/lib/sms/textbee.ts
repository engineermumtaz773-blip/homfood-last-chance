import type { SmsMessage, SmsProvider } from "@/lib/sms/provider";

export class TextBeeSmsProvider implements SmsProvider {
  async send({ recipient, message }: SmsMessage) {
    const apiKey = process.env.TEXTBEE_API_KEY;
    if (!apiKey) throw new Error("TEXTBEE_API_KEY is required for TextBee SMS.");
    const deviceId = process.env.TEXTBEE_DEVICE_ID;
    const response = await fetch("https://api.textbee.dev/api/v1/gateway/send-sms", {
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
    if (!response.ok) {
      const details = await response.text();
      throw new Error(`TextBee rejected SMS (${response.status}): ${details}`);
    }
  }
}
