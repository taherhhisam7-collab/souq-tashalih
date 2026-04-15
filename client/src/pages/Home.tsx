import { trpc } from "@/lib/trpc";
import { createClient, type Session } from "@supabase/supabase-js";
import { canUseDemoOtp, DEMO_ACCESS_TOKEN, DEMO_OTP_CODE, DEMO_PHONE, getDemoOtpHint } from "@/lib/demoOtp";
import {
  CarFront,
  CheckCircle2,
  CircleDollarSign,
  ImagePlus,
  Loader2,
  LogOut,
  PackageSearch,
  Phone,
  ShieldCheck,
  Star,
  Store,
  UserRound,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type RoleType = "customer" | "supplier";
type UploadPayload = { dataUrl: string; fileName: string; mimeType: string };
type ActivePanel = "request" | "car" | "offer" | "review" | null;

function normalizeSaudiPhone(input: string) {
  const digits = input.replace(/\D/g, "");
  if (!digits) return "+966";
  const normalized = digits.startsWith("966") ? digits.slice(3) : digits.startsWith("0") ? digits.slice(1) : digits;
  return `+966${normalized}`;
}

async function filesToPayload(files: File[]) {
  return Promise.all(
    files.map(
      (file) =>
        new Promise<UploadPayload>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            resolve({
              dataUrl: String(reader.result ?? ""),
              fileName: file.name,
              mimeType: file.type || "image/jpeg",
            });
          };
          reader.onerror = () => reject(new Error("تعذر قراءة الملف المختار."));
          reader.readAsDataURL(file);
        })
    )
  );
}

function MobileShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[420px] overflow-hidden rounded-[34px] border border-black/5 bg-[#f7f5ef] shadow-[0_20px_80px_rgba(0,0,0,0.12)]">
      {children}
    </div>
  );
}

function SectionCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[28px] bg-white p-4 shadow-[0_8px_24px_rgba(0,0,0,0.06)] ${className}`}>{children}</section>;
}

function ImageStrip({ images }: { images: string[] }) {
  if (!images.length) return null;
  return (
    <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
      {images.map((image, index) => (
        <img key={`${image}-${index}`} src={image} alt="preview" className="h-20 w-20 shrink-0 rounded-2xl object-cover" />
      ))}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[24px] bg-[#f3efe3] px-4 py-3 text-right">
      <p className="text-xs text-[#7d7a72]">{label}</p>
      <p className="mt-1 text-xl font-semibold text-[#161616]">{value}</p>
    </div>
  );
}

export default function Home() {
  const utils = trpc.useUtils();
  const configQuery = trpc.marketplace.getPublicConfig.useQuery();
  const [session, setSession] = useState<Session | null>(null);
  const [demoAccessToken, setDemoAccessToken] = useState<string>("");
  const [otpStep, setOtpStep] = useState<"phone" | "code">("phone");
  const [phoneInput, setPhoneInput] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [selectedRole, setSelectedRole] = useState<RoleType>("customer");
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [offerRequestId, setOfferRequestId] = useState<number | null>(null);
  const [reviewTarget, setReviewTarget] = useState<{ requestId: number; offerId: number } | null>(null);
  const [requestFiles, setRequestFiles] = useState<File[]>([]);
  const [offerFiles, setOfferFiles] = useState<File[]>([]);
  const [carFiles, setCarFiles] = useState<File[]>([]);
  const [profileName, setProfileName] = useState("");
  const [profileCity, setProfileCity] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [supportedBrands, setSupportedBrands] = useState("");
  const [requestForm, setRequestForm] = useState({
    vehicleBrand: "",
    vehicleModel: "",
    vehicleYear: "",
    partName: "",
    partDescription: "",
    city: "",
  });
  const [offerForm, setOfferForm] = useState({
    priceSar: "",
    partCondition: "used" as "new" | "used" | "refurbished",
    offerDescription: "",
    whatsappNumber: "",
  });
  const [carForm, setCarForm] = useState({
    vehicleBrand: "",
    vehicleModel: "",
    vehicleYear: "",
    conditionSummary: "",
    priceSar: "",
    city: "",
    description: "",
  });
  const [reviewForm, setReviewForm] = useState({
    rating: "5",
    comment: "",
  });

  const supabase = useMemo(() => {
    if (!configQuery.data?.url || !configQuery.data?.anonKey) return null;
    return createClient(configQuery.data.url, configQuery.data.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: "souq-tashaleeh-auth",
      },
    });
  }, [configQuery.data?.anonKey, configQuery.data?.url]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_, nextSession) => {
      setSession(nextSession ?? null);
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  const accessToken = session?.access_token ?? demoAccessToken;
  const isSignedIn = Boolean(session?.access_token || demoAccessToken);
  const appStateQuery = trpc.marketplace.getState.useQuery(
    { accessToken },
    {
      enabled: Boolean(accessToken),
      retry: false,
    }
  );

  const saveProfileMutation = trpc.marketplace.saveProfile.useMutation({
    onSuccess: async () => {
      await utils.marketplace.getState.invalidate();
      toast.success("تم تحديث بيانات الحساب.");
    },
    onError: (error) => toast.error(error.message),
  });

  const createRequestMutation = trpc.marketplace.createRequest.useMutation({
    onSuccess: async () => {
      setActivePanel(null);
      setRequestFiles([]);
      setRequestForm({ vehicleBrand: "", vehicleModel: "", vehicleYear: "", partName: "", partDescription: "", city: "" });
      await utils.marketplace.getState.invalidate();
      toast.success("تم إرسال طلب القطعة بنجاح.");
    },
    onError: (error) => toast.error(error.message),
  });

  const createOfferMutation = trpc.marketplace.createOffer.useMutation({
    onSuccess: async () => {
      setActivePanel(null);
      setOfferRequestId(null);
      setOfferFiles([]);
      setOfferForm({ priceSar: "", partCondition: "used", offerDescription: "", whatsappNumber: "" });
      await utils.marketplace.getState.invalidate();
      toast.success("تم إرسال عرض السعر للمشتري.");
    },
    onError: (error) => toast.error(error.message),
  });

  const createCarMutation = trpc.marketplace.createCarSale.useMutation({
    onSuccess: async () => {
      setActivePanel(null);
      setCarFiles([]);
      setCarForm({ vehicleBrand: "", vehicleModel: "", vehicleYear: "", conditionSummary: "", priceSar: "", city: "", description: "" });
      await utils.marketplace.getState.invalidate();
      toast.success("تم نشر السيارة المعروضة للبيع.");
    },
    onError: (error) => toast.error(error.message),
  });

  const acceptOfferMutation = trpc.marketplace.acceptOffer.useMutation({
    onSuccess: async () => {
      await utils.marketplace.getState.invalidate();
      toast.success("تم اعتماد العرض المحدد.");
    },
    onError: (error) => toast.error(error.message),
  });

  const completeDealMutation = trpc.marketplace.completeDeal.useMutation({
    onSuccess: async () => {
      await utils.marketplace.getState.invalidate();
      toast.success("تم إتمام الصفقة ويمكنك الآن إضافة التقييم.");
    },
    onError: (error) => toast.error(error.message),
  });

  const createReviewMutation = trpc.marketplace.createReview.useMutation({
    onSuccess: async () => {
      setActivePanel(null);
      setReviewTarget(null);
      setReviewForm({ rating: "5", comment: "" });
      await utils.marketplace.getState.invalidate();
      toast.success("تم حفظ التقييم والمراجعة.");
    },
    onError: (error) => toast.error(error.message),
  });

  const appState = appStateQuery.data as any;
  const currentUser = appState?.currentUser as any;
  const customerRequests = (appState?.customerRequests ?? []) as any[];
  const supplierRequests = (appState?.supplierRequests ?? []) as any[];
  const publicCars = (appState?.publicCars ?? []) as any[];
  const myCars = (appState?.myCars ?? []) as any[];
  const myReviews = (appState?.myReviews ?? []) as any[];

  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.role === "customer" || currentUser.role === "supplier") {
      setSelectedRole(currentUser.role);
    }
    setProfileName(currentUser.name ?? "");
    setProfileCity(currentUser.city ?? "");
    setBusinessName(currentUser.businessName ?? "");
    setSupportedBrands(Array.isArray(currentUser.supportedBrands) ? currentUser.supportedBrands.join("، ") : "");
  }, [currentUser?.id, currentUser?.role, currentUser?.name, currentUser?.city, currentUser?.businessName, currentUser?.supportedBrands]);

  const normalizedPhone = normalizeSaudiPhone(phoneInput);
  const isBusy =
    configQuery.isLoading ||
    appStateQuery.isLoading ||
    saveProfileMutation.isPending ||
    createRequestMutation.isPending ||
    createOfferMutation.isPending ||
    createCarMutation.isPending ||
    acceptOfferMutation.isPending ||
    completeDealMutation.isPending ||
    createReviewMutation.isPending;

  async function handleSendOtp() {
    if (!supabase && normalizedPhone !== DEMO_PHONE) return;
    const phone = normalizedPhone;
    if (phone.length < 13) {
      toast.error("أدخل رقم جوال سعودي صحيح يبدأ بـ +966.");
      return;
    }
    if (phone === DEMO_PHONE) {
      const hint = getDemoOtpHint(phone);
      setOtpStep("code");
      toast.success(`تم تفعيل الوضع التجريبي. استخدم الرمز ${hint?.code ?? DEMO_OTP_CODE} لإكمال الدخول.`);
      return;
    }
    const { error } = await supabase!.auth.signInWithOtp({ phone });
    if (error) {
      toast.error(error.message);
      return;
    }
    setOtpStep("code");
    toast.success("تم إرسال رمز التحقق إلى الجوال.");
  }

  async function handleVerifyOtp() {
    if (normalizedPhone === DEMO_PHONE) {
      if (!canUseDemoOtp(normalizedPhone, otpCode)) {
        toast.error("رمز OTP التجريبي غير صحيح.");
        return;
      }
      setDemoAccessToken(DEMO_ACCESS_TOKEN);
      setOtpCode("");
      toast.success("تم تسجيل الدخول بالحساب التجريبي بنجاح.");
      return;
    }
    if (!supabase) return;
    const { error } = await supabase.auth.verifyOtp({
      phone: normalizedPhone,
      token: otpCode,
      type: "sms",
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setDemoAccessToken("");
    toast.success("تم تسجيل الدخول بنجاح.");
  }

  async function handleLogout() {
    if (session && supabase) {
      await supabase.auth.signOut();
    }
    setDemoAccessToken("");
    setOtpStep("phone");
    setOtpCode("");
    setActivePanel(null);
    setOfferRequestId(null);
    toast.success("تم تسجيل الخروج.");
  }

  async function handleRoleSwitch(role: RoleType) {
    setSelectedRole(role);
    if (!accessToken) return;
    await saveProfileMutation.mutateAsync({
      accessToken,
      role,
      name: profileName,
      city: profileCity,
      businessName,
      supportedBrands: supportedBrands
        .split(/[،,]/)
        .map((item) => item.trim())
        .filter(Boolean),
    });
  }

  async function handleSaveProfile() {
    if (!accessToken) return;
    await saveProfileMutation.mutateAsync({
      accessToken,
      role: selectedRole,
      name: profileName,
      city: profileCity,
      businessName,
      supportedBrands: supportedBrands
        .split(/[،,]/)
        .map((item) => item.trim())
        .filter(Boolean),
    });
  }

  async function submitRequest() {
    if (!accessToken) {
      toast.error("سجّل الدخول أولاً لإرسال الطلب.");
      return;
    }
    const files = await filesToPayload(requestFiles);
    await createRequestMutation.mutateAsync({
      accessToken,
      vehicleBrand: requestForm.vehicleBrand,
      vehicleModel: requestForm.vehicleModel,
      vehicleYear: Number(requestForm.vehicleYear),
      partName: requestForm.partName,
      partDescription: requestForm.partDescription,
      city: requestForm.city,
      files,
    });
  }

  async function submitOffer() {
    if (!accessToken || !offerRequestId) {
      toast.error("اختر طلباً لإرسال العرض عليه.");
      return;
    }
    const files = await filesToPayload(offerFiles);
    await createOfferMutation.mutateAsync({
      accessToken,
      requestId: offerRequestId,
      priceSar: Number(offerForm.priceSar),
      partCondition: offerForm.partCondition,
      offerDescription: offerForm.offerDescription,
      whatsappNumber: offerForm.whatsappNumber,
      files,
    });
  }

  async function submitCarSale() {
    if (!accessToken) {
      toast.error("سجّل الدخول أولاً لإضافة السيارة.");
      return;
    }
    const files = await filesToPayload(carFiles);
    await createCarMutation.mutateAsync({
      accessToken,
      vehicleBrand: carForm.vehicleBrand,
      vehicleModel: carForm.vehicleModel,
      vehicleYear: Number(carForm.vehicleYear),
      conditionSummary: carForm.conditionSummary,
      priceSar: Number(carForm.priceSar),
      city: carForm.city,
      description: carForm.description,
      files,
    });
  }

  async function submitReview() {
    if (!accessToken || !reviewTarget) return;
    await createReviewMutation.mutateAsync({
      accessToken,
      requestId: reviewTarget.requestId,
      offerId: reviewTarget.offerId,
      rating: Number(reviewForm.rating),
      comment: reviewForm.comment,
    });
  }

  return (
    <div dir="rtl" className="min-h-screen bg-[#e6e7de] px-3 py-5 text-[#121212] sm:px-6">
      <MobileShell>
        <header className="rounded-b-[32px] bg-[#0c8f4a] px-5 pb-7 pt-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-white/75">منصة قطع غيار وسيارات</p>
              <h1 className="mt-1 text-3xl font-black tracking-tight">سوق التشاليح</h1>
            </div>
            {isSignedIn ? (
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-full bg-white/12 p-3 text-white transition hover:bg-white/20"
              >
                <LogOut className="h-5 w-5" />
              </button>
            ) : (
              <div className="rounded-full bg-white/15 px-4 py-2 text-sm font-medium">+966</div>
            )}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setActivePanel("request")}
              className="min-h-[154px] rounded-[30px] bg-[#121212] p-4 text-right text-white shadow-[0_18px_30px_rgba(0,0,0,0.24)]"
            >
              <PackageSearch className="h-8 w-8 text-white/80" />
              <div className="mt-10">
                <p className="text-sm text-white/65">للعملاء</p>
                <p className="mt-1 text-2xl font-extrabold">طلب قطعة</p>
                <p className="mt-2 text-xs leading-5 text-white/70">أرسل بيانات السيارة والقطعة المطلوبة واستقبل عروض الموردين.</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setActivePanel("car")}
              className="min-h-[154px] rounded-[30px] bg-white p-4 text-right text-[#101010] shadow-[0_18px_30px_rgba(0,0,0,0.10)]"
            >
              <CarFront className="h-8 w-8 text-[#0c8f4a]" />
              <div className="mt-10">
                <p className="text-sm text-[#6f6f6f]">للأفراد</p>
                <p className="mt-1 text-2xl font-extrabold">بيع سيارة</p>
                <p className="mt-2 text-xs leading-5 text-[#6d6d6d]">أضف بيانات السيارة والصور والسعر للوصول إلى المشترين داخل السعودية.</p>
              </div>
            </button>
          </div>
        </header>

        <main className="space-y-4 px-4 pb-6 pt-4">
          {!isSignedIn ? (
            <SectionCard>
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-[#edf8f0] p-3 text-[#0c8f4a]">
                  <Phone className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">تسجيل الدخول</h2>
                  <p className="text-sm text-[#77736a]">الدخول برقم الجوال السعودي مع رمز تحقق OTP عبر Supabase، مع تفعيل وضع تجريبي للرقم 0536051509.</p>
                </div>
              </div>

              <div className="mt-4 rounded-[24px] bg-[#f6f3eb] p-4">
                <label className="mb-2 block text-sm font-medium">رقم الجوال</label>
                <div className="flex items-center gap-2 rounded-2xl bg-white px-3 py-3">
                  <span className="rounded-xl bg-[#eef7f1] px-3 py-2 text-sm font-bold text-[#0c8f4a]">+966</span>
                  <input
                    value={phoneInput}
                    onChange={(event) => setPhoneInput(event.target.value)}
                    className="w-full bg-transparent text-left outline-none"
                    inputMode="numeric"
                    placeholder="5xxxxxxxx"
                  />
                </div>

                {normalizedPhone === DEMO_PHONE && otpStep === "phone" ? (
                  <p className="mt-3 rounded-2xl bg-[#eef7f1] px-4 py-3 text-xs leading-5 text-[#0c8f4a]">
                    للوضع التجريبي استخدم الرقم <span className="font-extrabold">0536051509</span> ثم أدخل الرمز <span className="font-extrabold">252525</span>.
                  </p>
                ) : null}

                {otpStep === "code" ? (
                  <>
                    <label className="mb-2 mt-4 block text-sm font-medium">رمز التحقق</label>
                    <input
                      value={otpCode}
                      onChange={(event) => setOtpCode(event.target.value)}
                      className="w-full rounded-2xl bg-white px-4 py-3 outline-none"
                      inputMode="numeric"
                      placeholder="أدخل 6 أرقام"
                    />
                  </>
                ) : null}

                <button
                  type="button"
                  onClick={otpStep === "phone" ? handleSendOtp : handleVerifyOtp}
                  className="mt-4 w-full rounded-2xl bg-[#111111] px-4 py-3 text-sm font-bold text-white"
                >
                  {otpStep === "phone" ? "إرسال رمز التحقق" : "تأكيد الدخول"}
                </button>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <StatBox label="التحقق" value="OTP" />
                <StatBox label="المفتاح" value="+966" />
                <StatBox label="التخزين" value="Supabase" />
              </div>
              <p className="mt-3 text-center text-xs text-[#847f75]">يمكنك اختبار الدخول مباشرة بالرقم 0536051509 والرمز 252525.</p>
            </SectionCard>
          ) : (
            <>
              <SectionCard>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-[#868278]">مرحباً بك</p>
                    <h2 className="text-xl font-black">{currentUser?.name || currentUser?.phoneNumber || "مستخدم سوق التشاليح"}</h2>
                  </div>
                  <div className="rounded-2xl bg-[#eef7f1] p-3 text-[#0c8f4a]">
                    {selectedRole === "customer" ? <UserRound className="h-6 w-6" /> : <Store className="h-6 w-6" />}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 rounded-[24px] bg-[#f5f2ea] p-2">
                  <button
                    type="button"
                    onClick={() => handleRoleSwitch("customer")}
                    className={`rounded-[18px] px-4 py-3 text-sm font-bold ${selectedRole === "customer" ? "bg-[#111111] text-white" : "bg-transparent text-[#69665d]"}`}
                  >
                    عميل
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRoleSwitch("supplier")}
                    className={`rounded-[18px] px-4 py-3 text-sm font-bold ${selectedRole === "supplier" ? "bg-[#111111] text-white" : "bg-transparent text-[#69665d]"}`}
                  >
                    مورد
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <StatBox label="طلباتي" value={customerRequests.length} />
                  <StatBox label="سياراتي" value={myCars.length} />
                </div>
              </SectionCard>

              <SectionCard>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold">الملف الشخصي</h3>
                    <p className="text-sm text-[#7f7a72]">احفظ بياناتك لتسهيل الشراء أو البيع أو تقديم العروض.</p>
                  </div>
                  <ShieldCheck className="h-5 w-5 text-[#0c8f4a]" />
                </div>
                <div className="mt-4 grid gap-3">
                  <input value={profileName} onChange={(event) => setProfileName(event.target.value)} className="rounded-2xl bg-[#f6f3eb] px-4 py-3 outline-none" placeholder="الاسم" />
                  <input value={profileCity} onChange={(event) => setProfileCity(event.target.value)} className="rounded-2xl bg-[#f6f3eb] px-4 py-3 outline-none" placeholder="المدينة" />
                  {selectedRole === "supplier" ? (
                    <>
                      <input value={businessName} onChange={(event) => setBusinessName(event.target.value)} className="rounded-2xl bg-[#f6f3eb] px-4 py-3 outline-none" placeholder="اسم النشاط أو المؤسسة" />
                      <input value={supportedBrands} onChange={(event) => setSupportedBrands(event.target.value)} className="rounded-2xl bg-[#f6f3eb] px-4 py-3 outline-none" placeholder="الماركات المدعومة، مثل: تويوتا، نيسان" />
                    </>
                  ) : null}
                </div>
                <button type="button" onClick={handleSaveProfile} className="mt-4 w-full rounded-2xl bg-[#0c8f4a] px-4 py-3 text-sm font-bold text-white">
                  حفظ البيانات
                </button>
              </SectionCard>

              {selectedRole === "customer" ? (
                <>
                  <SectionCard>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-bold">طلباتي</h3>
                        <p className="text-sm text-[#7b786e]">تابع حالة كل طلب والعروض الواردة عليه.</p>
                      </div>
                      <PackageSearch className="h-5 w-5 text-[#0c8f4a]" />
                    </div>
                    <div className="mt-4 space-y-3">
                      {customerRequests.length ? (
                        customerRequests.map((request) => (
                          <div key={request.id} className="rounded-[24px] border border-black/5 bg-[#fbfaf7] p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs text-[#8e8a82]">{request.vehicleBrand} {request.vehicleModel} • {request.vehicleYear}</p>
                                <h4 className="mt-1 text-lg font-bold">{request.partName}</h4>
                              </div>
                              <span className="rounded-full bg-[#eef7f1] px-3 py-1 text-xs font-bold text-[#0c8f4a]">{request.status}</span>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-[#5e5b55]">{request.partDescription || "لا يوجد وصف إضافي."}</p>
                            <ImageStrip images={request.imageUrls ?? []} />
                            <div className="mt-3 space-y-2">
                              {(request.offers ?? []).map((offer: any) => (
                                <div key={offer.id} className="rounded-2xl bg-white p-3 shadow-sm">
                                  <div className="flex items-center justify-between gap-3">
                                    <div>
                                      <p className="text-sm font-bold">{offer.supplier?.businessName || offer.supplier?.name || "مورد"}</p>
                                      <p className="text-xs text-[#7a766d]">{offer.offerDescription || "عرض سعر مرفق مع صور القطعة."}</p>
                                    </div>
                                    <div className="text-left">
                                      <p className="text-lg font-black">{offer.priceSar} ر.س</p>
                                      <p className="text-xs text-[#7a766d]">{offer.partCondition}</p>
                                    </div>
                                  </div>
                                  <ImageStrip images={offer.imageUrls ?? []} />
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {request.status !== "accepted" && request.status !== "completed" ? (
                                      <button
                                        type="button"
                                        onClick={() => acceptOfferMutation.mutate({ accessToken, requestId: request.id, offerId: offer.id })}
                                        className="rounded-full bg-[#111111] px-4 py-2 text-xs font-bold text-white"
                                      >
                                        اعتماد العرض
                                      </button>
                                    ) : null}
                                    {request.status === "accepted" ? (
                                      <button
                                        type="button"
                                        onClick={() => completeDealMutation.mutate({ accessToken, requestId: request.id, offerId: offer.id })}
                                        className="rounded-full bg-[#0c8f4a] px-4 py-2 text-xs font-bold text-white"
                                      >
                                        تم استلام القطعة
                                      </button>
                                    ) : null}
                                    {request.status === "completed" ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setReviewTarget({ requestId: request.id, offerId: offer.id });
                                          setActivePanel("review");
                                        }}
                                        className="rounded-full bg-[#f1ede2] px-4 py-2 text-xs font-bold text-[#111111]"
                                      >
                                        إضافة تقييم
                                      </button>
                                    ) : null}
                                    <span className="rounded-full bg-[#f4f0e7] px-4 py-2 text-xs text-[#6a665f]">واتساب: {offer.whatsappNumber || "غير مضاف"}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="rounded-2xl bg-[#f6f3eb] px-4 py-5 text-center text-sm text-[#716d64]">لا توجد طلبات بعد. ابدأ بإرسال طلب قطعة من البطاقة السوداء أعلاه.</p>
                      )}
                    </div>
                  </SectionCard>

                  <SectionCard>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-bold">سيارات معروضة للبيع</h3>
                        <p className="text-sm text-[#7e7a72]">قسم منفصل لبيع السيارات مع صور متعددة وسعر واضح.</p>
                      </div>
                      <CircleDollarSign className="h-5 w-5 text-[#0c8f4a]" />
                    </div>
                    <div className="mt-4 space-y-3">
                      {publicCars.length ? (
                        publicCars.map((car) => (
                          <div key={car.id} className="rounded-[24px] bg-[#fbfaf7] p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs text-[#8d887f]">{car.owner?.name || car.owner?.phoneNumber || "مالك السيارة"}</p>
                                <h4 className="mt-1 text-lg font-bold">{car.vehicleBrand} {car.vehicleModel} {car.vehicleYear}</h4>
                              </div>
                              <span className="rounded-full bg-white px-3 py-1 text-sm font-black">{car.priceSar} ر.س</span>
                            </div>
                            <p className="mt-2 text-sm text-[#5c5850]">{car.conditionSummary}</p>
                            <p className="mt-1 text-sm leading-6 text-[#726e66]">{car.description || "لا يوجد وصف إضافي."}</p>
                            <ImageStrip images={car.imageUrls ?? []} />
                          </div>
                        ))
                      ) : (
                        <p className="rounded-2xl bg-[#f6f3eb] px-4 py-5 text-center text-sm text-[#716d64]">لا توجد سيارات منشورة حالياً.</p>
                      )}
                    </div>
                  </SectionCard>
                </>
              ) : (
                <>
                  <SectionCard>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-bold">الطلبات المتاحة للموردين</h3>
                        <p className="text-sm text-[#7b786e]">اطلع على الطلبات المفتوحة وقدّم سعرك مع صور القطعة المتوفرة.</p>
                      </div>
                      <Store className="h-5 w-5 text-[#0c8f4a]" />
                    </div>
                    <div className="mt-4 space-y-3">
                      {supplierRequests.length ? (
                        supplierRequests.map((request) => (
                          <div key={request.id} className="rounded-[24px] bg-[#fbfaf7] p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs text-[#8d887f]">{request.customer?.city || request.city || "السعودية"}</p>
                                <h4 className="mt-1 text-lg font-bold">{request.partName}</h4>
                                <p className="mt-1 text-sm text-[#6b675f]">{request.vehicleBrand} {request.vehicleModel} • {request.vehicleYear}</p>
                              </div>
                              <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#0c8f4a]">{request.status}</span>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-[#5f5a53]">{request.partDescription || "لا يوجد وصف إضافي من العميل."}</p>
                            <ImageStrip images={request.imageUrls ?? []} />
                            <button
                              type="button"
                              onClick={() => {
                                setOfferRequestId(request.id);
                                setActivePanel("offer");
                              }}
                              className="mt-3 rounded-full bg-[#111111] px-4 py-2 text-xs font-bold text-white"
                            >
                              تقديم عرض سعر
                            </button>
                          </div>
                        ))
                      ) : (
                        <p className="rounded-2xl bg-[#f6f3eb] px-4 py-5 text-center text-sm text-[#716d64]">لا توجد طلبات جديدة حالياً للموردين.</p>
                      )}
                    </div>
                  </SectionCard>

                  <SectionCard>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-bold">مؤشرات المورد</h3>
                        <p className="text-sm text-[#7d7970]">متابعة التقييمات والجهوزية للعروض القادمة.</p>
                      </div>
                      <Star className="h-5 w-5 text-[#0c8f4a]" />
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <StatBox label="طلبات متاحة" value={supplierRequests.length} />
                      <StatBox label="تقييمات" value={myReviews.length} />
                      <StatBox label="الدور" value="مورد" />
                    </div>
                  </SectionCard>
                </>
              )}
            </>
          )}

          {activePanel === "request" ? (
            <SectionCard className="border-2 border-[#0c8f4a]/10">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold">نموذج طلب قطعة غيار</h3>
                  <p className="text-sm text-[#7c776e]">أدخل بيانات السيارة والقطعة المطلوبة وأرفق الصور إن وجدت.</p>
                </div>
                <button type="button" onClick={() => setActivePanel(null)} className="text-sm text-[#78746b]">إغلاق</button>
              </div>
              <div className="mt-4 grid gap-3">
                <input value={requestForm.vehicleBrand} onChange={(event) => setRequestForm((prev) => ({ ...prev, vehicleBrand: event.target.value }))} className="rounded-2xl bg-[#f6f3eb] px-4 py-3 outline-none" placeholder="نوع السيارة" />
                <input value={requestForm.vehicleModel} onChange={(event) => setRequestForm((prev) => ({ ...prev, vehicleModel: event.target.value }))} className="rounded-2xl bg-[#f6f3eb] px-4 py-3 outline-none" placeholder="الموديل" />
                <input value={requestForm.vehicleYear} onChange={(event) => setRequestForm((prev) => ({ ...prev, vehicleYear: event.target.value }))} className="rounded-2xl bg-[#f6f3eb] px-4 py-3 outline-none" inputMode="numeric" placeholder="السنة" />
                <input value={requestForm.partName} onChange={(event) => setRequestForm((prev) => ({ ...prev, partName: event.target.value }))} className="rounded-2xl bg-[#f6f3eb] px-4 py-3 outline-none" placeholder="اسم القطعة" />
                <textarea value={requestForm.partDescription} onChange={(event) => setRequestForm((prev) => ({ ...prev, partDescription: event.target.value }))} className="min-h-28 rounded-2xl bg-[#f6f3eb] px-4 py-3 outline-none" placeholder="وصف القطعة" />
                <input value={requestForm.city} onChange={(event) => setRequestForm((prev) => ({ ...prev, city: event.target.value }))} className="rounded-2xl bg-[#f6f3eb] px-4 py-3 outline-none" placeholder="المدينة" />
                <label className="flex items-center gap-3 rounded-2xl border border-dashed border-[#d9d4c8] bg-[#fbfaf7] px-4 py-4 text-sm text-[#6a665e]">
                  <ImagePlus className="h-5 w-5 text-[#0c8f4a]" />
                  <span>رفع صور للقطعة المطلوبة</span>
                  <input type="file" accept="image/*" multiple className="hidden" onChange={(event) => setRequestFiles(Array.from(event.target.files ?? []))} />
                </label>
                {requestFiles.length ? <p className="text-xs text-[#767168]">تم اختيار {requestFiles.length} ملف.</p> : null}
              </div>
              <button type="button" onClick={submitRequest} className="mt-4 w-full rounded-2xl bg-[#111111] px-4 py-3 text-sm font-bold text-white">
                إرسال الطلب
              </button>
            </SectionCard>
          ) : null}

          {activePanel === "offer" ? (
            <SectionCard className="border-2 border-[#0c8f4a]/10">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold">تقديم عرض سعر</h3>
                  <p className="text-sm text-[#7c776e]">أدخل السعر ووصف القطعة وأرفق صورها للمشتري.</p>
                </div>
                <button type="button" onClick={() => setActivePanel(null)} className="text-sm text-[#78746b]">إغلاق</button>
              </div>
              <div className="mt-4 grid gap-3">
                <input value={offerForm.priceSar} onChange={(event) => setOfferForm((prev) => ({ ...prev, priceSar: event.target.value }))} className="rounded-2xl bg-[#f6f3eb] px-4 py-3 outline-none" inputMode="numeric" placeholder="السعر بالريال" />
                <select value={offerForm.partCondition} onChange={(event) => setOfferForm((prev) => ({ ...prev, partCondition: event.target.value as "new" | "used" | "refurbished" }))} className="rounded-2xl bg-[#f6f3eb] px-4 py-3 outline-none">
                  <option value="used">مستعملة</option>
                  <option value="new">جديدة</option>
                  <option value="refurbished">مجددة</option>
                </select>
                <textarea value={offerForm.offerDescription} onChange={(event) => setOfferForm((prev) => ({ ...prev, offerDescription: event.target.value }))} className="min-h-24 rounded-2xl bg-[#f6f3eb] px-4 py-3 outline-none" placeholder="وصف العرض" />
                <input value={offerForm.whatsappNumber} onChange={(event) => setOfferForm((prev) => ({ ...prev, whatsappNumber: event.target.value }))} className="rounded-2xl bg-[#f6f3eb] px-4 py-3 outline-none" placeholder="رقم واتساب للتواصل" />
                <label className="flex items-center gap-3 rounded-2xl border border-dashed border-[#d9d4c8] bg-[#fbfaf7] px-4 py-4 text-sm text-[#6a665e]">
                  <ImagePlus className="h-5 w-5 text-[#0c8f4a]" />
                  <span>رفع صور القطعة المتوفرة</span>
                  <input type="file" accept="image/*" multiple className="hidden" onChange={(event) => setOfferFiles(Array.from(event.target.files ?? []))} />
                </label>
              </div>
              <button type="button" onClick={submitOffer} className="mt-4 w-full rounded-2xl bg-[#111111] px-4 py-3 text-sm font-bold text-white">
                إرسال العرض
              </button>
            </SectionCard>
          ) : null}

          {activePanel === "car" ? (
            <SectionCard className="border-2 border-[#0c8f4a]/10">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold">نموذج بيع سيارة</h3>
                  <p className="text-sm text-[#7c776e]">أضف البيانات الأساسية والحالة والسعر مع صور متعددة للسيارة.</p>
                </div>
                <button type="button" onClick={() => setActivePanel(null)} className="text-sm text-[#78746b]">إغلاق</button>
              </div>
              <div className="mt-4 grid gap-3">
                <input value={carForm.vehicleBrand} onChange={(event) => setCarForm((prev) => ({ ...prev, vehicleBrand: event.target.value }))} className="rounded-2xl bg-[#f6f3eb] px-4 py-3 outline-none" placeholder="نوع السيارة" />
                <input value={carForm.vehicleModel} onChange={(event) => setCarForm((prev) => ({ ...prev, vehicleModel: event.target.value }))} className="rounded-2xl bg-[#f6f3eb] px-4 py-3 outline-none" placeholder="الموديل" />
                <input value={carForm.vehicleYear} onChange={(event) => setCarForm((prev) => ({ ...prev, vehicleYear: event.target.value }))} className="rounded-2xl bg-[#f6f3eb] px-4 py-3 outline-none" inputMode="numeric" placeholder="السنة" />
                <input value={carForm.conditionSummary} onChange={(event) => setCarForm((prev) => ({ ...prev, conditionSummary: event.target.value }))} className="rounded-2xl bg-[#f6f3eb] px-4 py-3 outline-none" placeholder="حالة السيارة" />
                <input value={carForm.priceSar} onChange={(event) => setCarForm((prev) => ({ ...prev, priceSar: event.target.value }))} className="rounded-2xl bg-[#f6f3eb] px-4 py-3 outline-none" inputMode="numeric" placeholder="السعر" />
                <input value={carForm.city} onChange={(event) => setCarForm((prev) => ({ ...prev, city: event.target.value }))} className="rounded-2xl bg-[#f6f3eb] px-4 py-3 outline-none" placeholder="المدينة" />
                <textarea value={carForm.description} onChange={(event) => setCarForm((prev) => ({ ...prev, description: event.target.value }))} className="min-h-24 rounded-2xl bg-[#f6f3eb] px-4 py-3 outline-none" placeholder="وصف إضافي" />
                <label className="flex items-center gap-3 rounded-2xl border border-dashed border-[#d9d4c8] bg-[#fbfaf7] px-4 py-4 text-sm text-[#6a665e]">
                  <ImagePlus className="h-5 w-5 text-[#0c8f4a]" />
                  <span>رفع صور متعددة للسيارة</span>
                  <input type="file" accept="image/*" multiple className="hidden" onChange={(event) => setCarFiles(Array.from(event.target.files ?? []))} />
                </label>
              </div>
              <button type="button" onClick={submitCarSale} className="mt-4 w-full rounded-2xl bg-[#111111] px-4 py-3 text-sm font-bold text-white">
                نشر السيارة
              </button>
            </SectionCard>
          ) : null}

          {activePanel === "review" && reviewTarget ? (
            <SectionCard className="border-2 border-[#0c8f4a]/10">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold">تقييم ومراجعة</h3>
                  <p className="text-sm text-[#7c776e]">يظهر هذا القسم بعد إتمام الصفقة بين العميل والمورد.</p>
                </div>
                <button type="button" onClick={() => setActivePanel(null)} className="text-sm text-[#78746b]">إغلاق</button>
              </div>
              <div className="mt-4 grid gap-3">
                <select value={reviewForm.rating} onChange={(event) => setReviewForm((prev) => ({ ...prev, rating: event.target.value }))} className="rounded-2xl bg-[#f6f3eb] px-4 py-3 outline-none">
                  <option value="5">5 نجوم</option>
                  <option value="4">4 نجوم</option>
                  <option value="3">3 نجوم</option>
                  <option value="2">2 نجمتان</option>
                  <option value="1">نجمة واحدة</option>
                </select>
                <textarea value={reviewForm.comment} onChange={(event) => setReviewForm((prev) => ({ ...prev, comment: event.target.value }))} className="min-h-24 rounded-2xl bg-[#f6f3eb] px-4 py-3 outline-none" placeholder="اكتب مراجعتك" />
              </div>
              <button type="button" onClick={submitReview} className="mt-4 w-full rounded-2xl bg-[#111111] px-4 py-3 text-sm font-bold text-white">
                حفظ التقييم
              </button>
            </SectionCard>
          ) : null}

          {isBusy ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-4 text-sm text-[#716b64]">
              <Loader2 className="h-4 w-4 animate-spin" />
              جارِ تحديث البيانات...
            </div>
          ) : null}

          <div className="grid grid-cols-3 gap-2 rounded-[28px] bg-[#111111] p-3 text-white">
            <div className="rounded-[20px] bg-white/10 px-3 py-3 text-center">
              <CheckCircle2 className="mx-auto h-5 w-5" />
              <p className="mt-2 text-xs">RTL عربي</p>
            </div>
            <div className="rounded-[20px] bg-white/10 px-3 py-3 text-center">
              <ShieldCheck className="mx-auto h-5 w-5" />
              <p className="mt-2 text-xs">OTP</p>
            </div>
            <div className="rounded-[20px] bg-white/10 px-3 py-3 text-center">
              <ImagePlus className="mx-auto h-5 w-5" />
              <p className="mt-2 text-xs">Storage</p>
            </div>
          </div>
        </main>
      </MobileShell>
    </div>
  );
}
