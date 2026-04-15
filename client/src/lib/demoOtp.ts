export const DEMO_PHONE_LOCAL = "0536051509";
export const DEMO_PHONE = "+966536051509";
export const DEMO_OTP_CODE = "252525";
export const DEMO_ACCESS_TOKEN = "demo:+966536051509";

export function isDemoPhone(phone: string) {
  return phone === DEMO_PHONE;
}

export function canUseDemoOtp(phone: string, code: string) {
  return isDemoPhone(phone) && code === DEMO_OTP_CODE;
}

export function getDemoOtpHint(phone: string) {
  if (!isDemoPhone(phone)) return null;
  return {
    phone: DEMO_PHONE_LOCAL,
    code: DEMO_OTP_CODE,
    accessToken: DEMO_ACCESS_TOKEN,
  } as const;
}
