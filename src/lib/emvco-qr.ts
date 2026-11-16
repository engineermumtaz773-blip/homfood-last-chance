/**
 * UNIVERSAL SBP RAAST & 1LINK EMVCo MERCHANT-PRESENTED MODE (MPM) QR GENERATOR
 * Standardized for ALL Pakistani Banking and Wallet Apps:
 * MCB Live, Easypaisa, JazzCash, SadaPay, NayaPay, Raast P2M, HBL, Meezan, Bank Alfalah.
 */

export const RAAST_MERCHANT_IBAN = "PK03MUCB1691359691009955";
export const RAAST_MERCHANT_NAME = "MUMTAZ ALI";
export const RAAST_REF_NUMBER = "9955";
export const MCB_NATIVE_QR = "0002020102110202000424PK03MUCB169135969100995510043DED";

export type EmvcoRaastOptions = {
  merchantName?: string;
  ref?: string;
  iban?: string;
  amount: number;
  city?: string;
  purpose?: string;
};

function formatTLV(tag: string, value: string): string {
  const len = String(value.length).padStart(2, "0");
  return `${tag}${len}${value}`;
}

/**
 * Computes CRC-16/CCITT-FALSE (polynomial 0x1021, initial value 0xFFFF)
 * Strictly adheres to EMVCo Merchant-Presented Mode standard section 4.7.
 */
export function computeCrc16(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Generates an interoperable EMVCo QR code string recognized by all Pakistani banking apps.
 * Implements SBP Raast P2M, 1LINK Interoperable, and Direct IBAN merchant descriptors.
 */
export function generateEmvcoRaastQrString(options: EmvcoRaastOptions): string {
  const merchantName = (options.merchantName || RAAST_MERCHANT_NAME).trim().slice(0, 25);
  const ref = (options.ref || RAAST_REF_NUMBER).trim();
  const iban = (options.iban || RAAST_MERCHANT_IBAN).trim();
  const city = (options.city || "Bahawalpur").trim().slice(0, 15);
  const purpose = (options.purpose || "Food Order").trim().slice(0, 25);
  const amountStr = options.amount > 0 ? options.amount.toFixed(2) : "0.00";

  // Tag 04: Direct 1LINK / SBP Interoperable IBAN
  const tag04 = formatTLV("04", iban);

  // Tag 26: 1LINK Raast Interoperable Template
  const sub26 = formatTLV("00", "pk.raast") + formatTLV("01", iban);
  const tag26 = formatTLV("26", sub26);

  // Tag 28: State Bank of Pakistan Official Raast P2M Template
  const sub28 = formatTLV("00", "pk.gov.sbp.raast") + formatTLV("01", iban) + formatTLV("02", "01");
  const tag28 = formatTLV("28", sub28);

  // Tag 62: Additional Data Field Template (Bill/Ref, Terminal, Purpose)
  const sub62 =
    formatTLV("01", ref) +
    formatTLV("05", ref) +
    formatTLV("07", ref) +
    formatTLV("08", purpose);
  const tag62 = formatTLV("62", sub62);

  // Construct standard EMVCo MPM Payload
  const rawPayload =
    formatTLV("00", "01") + // Payload Format Indicator: 01
    formatTLV("01", "12") + // Point of Initiation: 12 (Dynamic QR with cart amount)
    tag04 + // Tag 04: 1LINK Direct IBAN
    tag26 + // Tag 26: 1LINK Raast Interoperable Template
    tag28 + // Tag 28: SBP Official Raast P2M Template
    formatTLV("52", "5812") + // Merchant Category Code (Restaurants)
    formatTLV("53", "586") + // Currency: 586 (PKR)
    formatTLV("54", amountStr) + // Dynamic Transaction Amount
    formatTLV("58", "PK") + // Country Code: PK
    formatTLV("59", merchantName) + // Merchant Name: MUMTAZ ALI
    formatTLV("60", city) + // Merchant City: Bahawalpur
    tag62 + // Additional Reference Information
    "6304"; // Tag 63 (CRC) with length 04

  const crc = computeCrc16(rawPayload);
  return `${rawPayload}${crc}`;
}
