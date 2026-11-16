export type SmsMessage = {
  recipient: string;
  message: string;
};

export interface SmsProvider {
  send(message: SmsMessage): Promise<void>;
}

export async function getSmsProvider(): Promise<SmsProvider> {
  const provider = process.env.SMS_PROVIDER;
  if (provider === "mock") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SMS_PROVIDER=mock is not permitted in production.");
    }
    return {
      async send({ recipient, message }) {
        console.info(`[SMS MOCK] ${recipient}: ${message}`);
      },
    };
  }
  if (provider === "textbee") {
    const { TextBeeSmsProvider } = await import("@/lib/sms/textbee");
    return new TextBeeSmsProvider();
  }
  throw new Error("Set SMS_PROVIDER to textbee or mock.");
}
