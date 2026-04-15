import { createClient } from "@supabase/supabase-js";
import { ENV } from "./_core/env";

export const MARKETPLACE_BUCKET = "souq-media";

type UploadableFile = {
  dataUrl: string;
  fileName: string;
  mimeType: string;
};

function assertSupabaseEnv() {
  if (!ENV.supabaseUrl || !ENV.supabaseAnonKey || !ENV.supabaseServiceRoleKey) {
    throw new Error("Supabase environment variables are not configured correctly.");
  }
}

export function getSupabaseAdmin() {
  assertSupabaseEnv();
  return createClient(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function getSupabasePublicConfig() {
  assertSupabaseEnv();
  return {
    url: ENV.supabaseUrl,
    anonKey: ENV.supabaseAnonKey,
  };
}

export async function verifySupabaseAccessToken(accessToken: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(accessToken);

  if (error || !data.user) {
    throw new Error("تعذر التحقق من جلسة Supabase الحالية.");
  }

  return data.user;
}

export async function ensureMarketplaceBucket() {
  const supabase = getSupabaseAdmin();
  const { data: buckets, error } = await supabase.storage.listBuckets();

  if (error) {
    throw new Error(`تعذر قراءة مستودعات Supabase: ${error.message}`);
  }

  const exists = buckets.some((bucket) => bucket.name === MARKETPLACE_BUCKET);
  if (exists) return;

  const { error: createError } = await supabase.storage.createBucket(MARKETPLACE_BUCKET, {
    public: true,
    fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic"],
  });

  if (createError && !createError.message.toLowerCase().includes("already exists")) {
    throw new Error(`تعذر إنشاء bucket الوسائط في Supabase: ${createError.message}`);
  }
}

function decodeDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
  if (!match) {
    throw new Error("صيغة الملف المرفوع غير صحيحة.");
  }

  return {
    mimeType: match[1] || "application/octet-stream",
    buffer: Buffer.from(match[2], "base64"),
  };
}

function slugifyName(fileName: string) {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9\.\-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "upload";
}

export async function uploadImagesToSupabase(params: {
  files: UploadableFile[];
  userId: string;
  folder: string;
}) {
  if (!params.files.length) return [];

  await ensureMarketplaceBucket();
  const supabase = getSupabaseAdmin();

  const uploads = await Promise.all(
    params.files.map(async (file, index) => {
      const decoded = decodeDataUrl(file.dataUrl);
      const extension = file.mimeType.split("/")[1] || decoded.mimeType.split("/")[1] || "jpg";
      const path = `${params.folder}/${params.userId}/${Date.now()}-${index}-${slugifyName(file.fileName)}.${extension.replace(/[^a-z0-9]/gi, "")}`;

      const { error } = await supabase.storage
        .from(MARKETPLACE_BUCKET)
        .upload(path, decoded.buffer, {
          contentType: file.mimeType || decoded.mimeType,
          upsert: false,
        });

      if (error) {
        throw new Error(`تعذر رفع الملف إلى Supabase Storage: ${error.message}`);
      }

      const { data } = supabase.storage.from(MARKETPLACE_BUCKET).getPublicUrl(path);
      return data.publicUrl;
    })
  );

  return uploads;
}
