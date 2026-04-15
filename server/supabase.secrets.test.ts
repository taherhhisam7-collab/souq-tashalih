import { describe, expect, it } from "vitest";
import { getSupabasePublicConfig, MARKETPLACE_BUCKET } from "./supabase";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe("supabase secrets", () => {
  it("has the required environment variables", () => {
    expect(SUPABASE_URL).toBeTruthy();
    expect(SUPABASE_ANON_KEY).toBeTruthy();
    expect(SUPABASE_SERVICE_ROLE_KEY).toBeTruthy();
  });

  it("accepts the anon key against auth settings endpoint", async () => {
    const response = await fetch(new URL("/auth/v1/settings", SUPABASE_URL).toString(), {
      headers: {
        apikey: SUPABASE_ANON_KEY!,
      },
    });

    expect(response.ok).toBe(true);
    const payload = (await response.json()) as { disable_signup?: boolean };
    expect(typeof payload).toBe("object");
  });

  it("accepts the service role key against storage buckets endpoint", async () => {
    const response = await fetch(new URL("/storage/v1/bucket", SUPABASE_URL).toString(), {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY!}`,
      },
    });

    expect(response.ok).toBe(true);
    const payload = await response.json();
    expect(Array.isArray(payload)).toBe(true);
  });

  it("returns the public client configuration used by the marketplace router", () => {
    expect(getSupabasePublicConfig()).toEqual({
      url: SUPABASE_URL,
      anonKey: SUPABASE_ANON_KEY,
    });
    expect(MARKETPLACE_BUCKET).toBe("souq-media");
  });
});
