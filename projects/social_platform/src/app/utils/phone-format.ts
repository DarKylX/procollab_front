/** @format */

export const RUSSIAN_PHONE_PATTERN = /^\+7 \(\d{3}\) \d{3}-\d{2}-\d{2}$/;

export function formatRussianPhone(value: unknown): string {
  const raw = String(value ?? "").trim();
  const rawDigits = raw.replace(/\D/g, "");

  if (!rawDigits) {
    return "";
  }

  let digits = rawDigits;

  if (digits.startsWith("8")) {
    digits = `7${digits.slice(1)}`;
  } else if (!digits.startsWith("7")) {
    digits = `7${digits}`;
  }

  digits = digits.slice(0, 11);

  const national = digits.startsWith("7") ? digits.slice(1) : digits;
  const code = national.slice(0, 3);
  const first = national.slice(3, 6);
  const second = national.slice(6, 8);
  const third = national.slice(8, 10);

  let formatted = "+7";

  if (code) {
    formatted += ` (${code}`;
  }

  if (code.length === 3) {
    formatted += ")";
  }

  if (first) {
    formatted += ` ${first}`;
  }

  if (second) {
    formatted += `-${second}`;
  }

  if (third) {
    formatted += `-${third}`;
  }

  return formatted;
}

export function normalizeRussianPhone(value: unknown): string {
  const digits = formatRussianPhone(value).replace(/\D/g, "");

  return digits ? `+${digits}` : "";
}
