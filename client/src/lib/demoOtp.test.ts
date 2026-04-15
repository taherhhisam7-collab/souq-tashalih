import { describe, expect, it } from "vitest";
import { canUseDemoOtp, DEMO_ACCESS_TOKEN, DEMO_OTP_CODE, DEMO_PHONE, DEMO_PHONE_LOCAL, getDemoOtpHint, isDemoPhone } from "./demoOtp";

describe("demo otp flow", () => {
  it("matches the configured Saudi demo phone", () => {
    expect(DEMO_PHONE_LOCAL).toBe("0536051509");
    expect(DEMO_PHONE).toBe("+966536051509");
    expect(isDemoPhone(DEMO_PHONE)).toBe(true);
    expect(isDemoPhone("+966500000000")).toBe(false);
  });

  it("accepts only the configured demo otp code", () => {
    expect(DEMO_OTP_CODE).toBe("252525");
    expect(canUseDemoOtp(DEMO_PHONE, DEMO_OTP_CODE)).toBe(true);
    expect(canUseDemoOtp(DEMO_PHONE, "111111")).toBe(false);
    expect(canUseDemoOtp("+966500000000", DEMO_OTP_CODE)).toBe(false);
  });

  it("returns the demo hint payload used by the login screen", () => {
    expect(getDemoOtpHint(DEMO_PHONE)).toEqual({
      phone: DEMO_PHONE_LOCAL,
      code: DEMO_OTP_CODE,
      accessToken: DEMO_ACCESS_TOKEN,
    });
    expect(getDemoOtpHint("+966500000000")).toBeNull();
  });
});
