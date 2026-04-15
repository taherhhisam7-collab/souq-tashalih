import { trpc } from "@/lib/trpc";
import { createClient, type Session } from "@supabase/supabase-js";
import { canUseDemoOtp, DEMO_ACCESS_TOKEN, DEMO_OTP_CODE, DEMO_PHONE, getDemoOtpHint } from "@/lib/demoOtp";
import {
  ArrowLeft,
  BellRing,
  CarFront,
  CheckCircle2,
  ChevronLeft,
  CircleDollarSign,
  ImagePlus,
  Loader2,
  LogOut,
  PackageSearch,
  Phone,
  ShieldAlert,
  ShieldCheck,
  Star,
  Store,
  TrendingUp,
  UserRound,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

type RoleType = "customer" | "supplier";
type UploadPayload = { dataUrl: string; fileName: string; mimeType: string };
type ActivePanel = "request" | "car" | "offer" | "review" | null;
type SalesRange = "daily" | "weekly" | "monthly";

const FALLBACK_VEHICLE_TYPES = [
  "تويوتا كامري",
  "تويوتا كورولا",
  "تويوتا هايلوكس",
  "هونداي النترا",
  "هونداي سوناتا",
  "نيسان صني",
  "نيسان التيما",
  "كيا سيراتو",
  "فورد اكسبلورر",
  "شفروليه تاهو",
];

const FALLBACK_CITIES = ["جدة", "الرياض", "الدمام"];

function normalizeSaudiPhone(input: string) {
  const digits = input.replace(/\D/g, "");
  if (!digits) return "+966";
  const normalized = digits.startsWith("966") ? digits.slice(3) : digits.startsWith("0") ? digits.slice(1) : digits;
  return `+966${normalized}`;
}

function normalizeWhatsappNumber(input?: string | null) {
  if (!input) return null;
  const digits = input.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("966")) return digits;
  if (digits.startsWith("05")) return `966${digits.slice(1)}`;
  if (digits.startsWith("5") && digits.length === 9) return `966${digits}`;
  return digits;
}

function buildWhatsappLink(whatsappNumber: string | null | undefined, partName: string, priceSar: number) {
  const normalizedNumber = normalizeWhatsappNumber(whatsappNumber);
  if (!normalizedNumber) return null;
  const text = `مرحبا، بخصوص طلب قطعة ${partName} بسعر ${priceSar} في سوق التشاليح`;
  return `https://wa.me/${normalizedNumber}?text=${encodeURIComponent(text)}`;
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

function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="mb-2 block text-sm font-semibold text-[#47433d]">{children}</label>;
}

function InputField(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`w-full rounded-2xl bg-[#f6f3eb] px-4 py-3 outline-none ${props.className ?? ""}`} />;
}

function TextAreaField(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`min-h-24 w-full rounded-2xl bg-[#f6f3eb] px-4 py-3 outline-none ${props.className ?? ""}`} />;
}

function SelectField(props: React.SelectHTMLAttributes<HTMLSelectElement> & { options: string[]; placeholder: string }) {
  const { options, placeholder, className, ...rest } = props;
  return (
    <select {...rest} className={`w-full rounded-2xl bg-[#f6f3eb] px-4 py-3 outline-none ${className ?? ""}`}>
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
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

function RatingStars({ value }: { value: number }) {
  const normalized = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }, (_, index) => (
        <Star key={index} className={`h-4 w-4 ${index < normalized ? "fill-[#f6b400] text-[#f6b400]" : "text-[#d0ccc2]"}`} />
      ))}
    </div>
  );
}

function StarPicker({ label, value, onChange }: { label: string; value: number; onChange: (next: number) => void }) {
  return (
    <div className="rounded-[22px] bg-[#f6f3eb] p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-[#3e3a34]">{label}</span>
        <span className="text-xs text-[#77736a]">{value}/5</span>
      </div>
      <div className="mt-3 flex items-center gap-1">
        {Array.from({ length: 5 }, (_, index) => {
          const starValue = index + 1;
          return (
            <button key={starValue} type="button" onClick={() => onChange(starValue)} className="rounded-full p-1">
              <Star className={`h-6 w-6 ${starValue <= value ? "fill-[#f6b400] text-[#f6b400]" : "text-[#d8d4ca]"}`} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function formatNotificationTime(value?: string | null) {
  if (!value) return "الآن";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "الآن";
  return parsed.toLocaleString("ar-SA", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function Home() {
  const utils = trpc.useUtils();
  const configQuery = trpc.marketplace.getPublicConfig.useQuery();
  const [location, setLocation] = useLocation();
  const isSupplierDashboardRoute = location === "/supplier/dashboard";

  const [session, setSession] = useState<Session | null>(null);
  const [demoAccessToken, setDemoAccessToken] = useState<string>("");
  const [otpStep, setOtpStep] = useState<"phone" | "code">("phone");
  const [phoneInput, setPhoneInput] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [selectedRole, setSelectedRole] = useState<RoleType>(isSupplierDashboardRoute ? "supplier" : "customer");
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [isNotificationTrayOpen, setIsNotificationTrayOpen] = useState(false);
  const [offerRequestId, setOfferRequestId] = useState<number | null>(null);
  const [reviewTarget, setReviewTarget] = useState<{ requestId: number; offerId: number; supplierName: string } | null>(null);
  const [requestFiles, setRequestFiles] = useState<File[]>([]);
  const [offerFiles, setOfferFiles] = useState<File[]>([]);
  const [carFiles, setCarFiles] = useState<File[]>([]);
  const [profileName, setProfileName] = useState("");
  const [profileCity, setProfileCity] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [supportedBrands, setSupportedBrands] = useState("");
  const [salesRange, setSalesRange] = useState<SalesRange>("weekly");
  const [liveBanner, setLiveBanner] = useState<{ id: number; title: string; body?: string | null } | null>(null);
  const [streamState, setStreamState] = useState<"idle" | "connected" | "degraded">("idle");
  const [requestForm, setRequestForm] = useState({
    vehicleBrand: "",
    modelYear: "",
    partName: "",
    city: "",
    partDescription: "",
  });
  const [offerForm, setOfferForm] = useState({
    priceSar: "",
    partCondition: "used" as "new" | "used" | "refurbished",
    warranty: "",
    offerDescription: "",
    whatsappNumber: "",
  });
  const [carForm, setCarForm] = useState({
    location: "",
    vehicleBrand: "",
    modelYear: "",
    priceSar: "",
    damageDescription: "",
  });
  const [reviewForm, setReviewForm] = useState({
    qualityRating: 5,
    responseSpeedRating: 5,
    priceRating: 5,
    comment: "",
  });

  const receivedLiveNotificationIds = useRef<Set<number>>(new Set());
  const liveBannerTimeoutRef = useRef<number | null>(null);

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
    setSelectedRole(isSupplierDashboardRoute ? "supplier" : "customer");
  }, [isSupplierDashboardRoute]);

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

  useEffect(() => {
    return () => {
      if (liveBannerTimeoutRef.current) {
        window.clearTimeout(liveBannerTimeoutRef.current);
      }
    };
  }, []);

  const accessToken = session?.access_token ?? demoAccessToken;
  const isSignedIn = Boolean(accessToken);

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
      setRequestForm({ vehicleBrand: "", modelYear: "", partName: "", city: "", partDescription: "" });
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
      setOfferForm({ priceSar: "", partCondition: "used", warranty: "", offerDescription: "", whatsappNumber: "" });
      await utils.marketplace.getState.invalidate();
      toast.success("تم إرسال عرض السعر للمشتري.");
    },
    onError: (error) => toast.error(error.message),
  });

  const createCarMutation = trpc.marketplace.createCarSale.useMutation({
    onSuccess: async () => {
      setActivePanel(null);
      setCarFiles([]);
      setCarForm({ location: "", vehicleBrand: "", modelYear: "", priceSar: "", damageDescription: "" });
      await utils.marketplace.getState.invalidate();
      toast.success("تم حفظ السيارة المصدومة في السوق.");
    },
    onError: (error) => toast.error(error.message),
  });

  const acceptOfferMutation = trpc.marketplace.acceptOffer.useMutation({
    onError: (error) => toast.error(error.message),
  });

  const completeDealMutation = trpc.marketplace.completeDeal.useMutation({
    onError: (error) => toast.error(error.message),
  });

  const createReviewMutation = trpc.marketplace.createReview.useMutation({
    onSuccess: async () => {
      setActivePanel(null);
      setReviewTarget(null);
      setReviewForm({ qualityRating: 5, responseSpeedRating: 5, priceRating: 5, comment: "" });
      await utils.marketplace.getState.invalidate();
      toast.success("تم حفظ التقييم وتحديث متوسط المورد.");
    },
    onError: (error) => toast.error(error.message),
  });

  const markNotificationReadMutation = trpc.marketplace.markNotificationRead.useMutation({
    onSuccess: async () => {
      await utils.marketplace.getState.invalidate();
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
  const notificationItems = (appState?.notifications ?? []) as any[];
  const unreadNotificationsCount = Number(appState?.unreadNotificationsCount ?? 0);
  const allowedVehicleTypes = (appState?.allowedVehicleTypes ?? FALLBACK_VEHICLE_TYPES) as string[];
  const allowedCities = (appState?.allowedCities ?? FALLBACK_CITIES) as string[];
  const supplierDashboard = (appState?.supplierDashboard ?? {
    acceptedOffersCount: 0,
    conversionRate: 0,
    totalRevenueSar: 0,
    newRequestsCount: supplierRequests.length,
    topBrands: [],
    topParts: [],
    salesSeries: { daily: [], weekly: [], monthly: [], isFallback: false },
    smartSuggestions: [],
  }) as any;

  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.role === "customer" || currentUser.role === "supplier") {
      setSelectedRole(isSupplierDashboardRoute ? "supplier" : currentUser.role);
    }
    setProfileName(currentUser.name ?? "");
    setProfileCity(currentUser.city ?? "");
    setBusinessName(currentUser.businessName ?? "");
    setSupportedBrands(Array.isArray(currentUser.supportedBrands) ? currentUser.supportedBrands.join("، ") : "");
    setOfferForm((prev) => ({ ...prev, whatsappNumber: prev.whatsappNumber || currentUser.phoneNumber || "" }));
  }, [currentUser?.id, currentUser?.role, currentUser?.name, currentUser?.city, currentUser?.businessName, currentUser?.supportedBrands, currentUser?.phoneNumber, isSupplierDashboardRoute]);

  useEffect(() => {
    receivedLiveNotificationIds.current.clear();
    setLiveBanner(null);
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !isSignedIn) return;

    const eventSource = new EventSource(`/api/marketplace/notifications/stream?accessToken=${encodeURIComponent(accessToken)}`);
    eventSource.onopen = () => setStreamState("connected");

    eventSource.onmessage = (event) => {
      if (!event.data) return;
      try {
        const payload = JSON.parse(event.data) as { type?: string; notification?: { id?: number; title?: string; body?: string | null } };
        if (payload.type !== "notification" || !payload.notification?.id) return;
        if (receivedLiveNotificationIds.current.has(payload.notification.id)) return;
        receivedLiveNotificationIds.current.add(payload.notification.id);
        setIsNotificationTrayOpen(true);
        setStreamState("connected");
        setLiveBanner({
          id: payload.notification.id,
          title: payload.notification.title ?? "وصل إشعار جديد",
          body: payload.notification.body ?? "تم استلام عرض جديد على أحد طلباتك.",
        });
        if (liveBannerTimeoutRef.current) {
          window.clearTimeout(liveBannerTimeoutRef.current);
        }
        liveBannerTimeoutRef.current = window.setTimeout(() => setLiveBanner(null), 6000);
        void utils.marketplace.getState.invalidate();
      } catch (error) {
        setStreamState("degraded");
        console.error("تعذر تحليل الإشعار اللحظي", error);
      }
    };

    eventSource.onerror = () => {
      setStreamState("degraded");
    };

    return () => {
      eventSource.close();
    };
  }, [accessToken, isSignedIn, utils.marketplace.getState]);

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
    createReviewMutation.isPending ||
    markNotificationReadMutation.isPending;

  const selectedRequestForOffer = supplierRequests.find((request) => request.id === offerRequestId);
  const chartItems = (supplierDashboard?.salesSeries?.[salesRange] ?? []) as Array<{ label: string; value: number }>;
  const chartMax = Math.max(...chartItems.map((item) => item.value), 1);

  async function handleSendOtp() {
    if (!supabase && normalizedPhone !== DEMO_PHONE) return;
    if (normalizedPhone.length < 13) {
      toast.error("أدخل رقم جوال سعودي صحيح يبدأ بـ +966.");
      return;
    }
    if (normalizedPhone === DEMO_PHONE) {
      const hint = getDemoOtpHint(normalizedPhone);
      setOtpStep("code");
      toast.success(`تم تفعيل الوضع التجريبي. استخدم الرمز ${hint?.code ?? DEMO_OTP_CODE} لإكمال الدخول.`);
      return;
    }
    const { error } = await supabase!.auth.signInWithOtp({ phone: normalizedPhone });
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
    setIsNotificationTrayOpen(false);
    setLiveBanner(null);
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
    if (!requestForm.vehicleBrand || !requestForm.modelYear || !requestForm.partName || !requestForm.city) {
      toast.error("أكمل جميع الحقول المطلوبة في نموذج طلب القطعة.");
      return;
    }
    const files = await filesToPayload(requestFiles);
    await createRequestMutation.mutateAsync({
      accessToken,
      vehicleBrand: requestForm.vehicleBrand,
      vehicleModel: requestForm.modelYear,
      vehicleYear: Number(requestForm.modelYear),
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
    if (!offerForm.priceSar || !offerForm.whatsappNumber) {
      toast.error("أدخل السعر ورقم الواتساب قبل إرسال العرض.");
      return;
    }
    const files = await filesToPayload(offerFiles);
    await createOfferMutation.mutateAsync({
      accessToken,
      requestId: offerRequestId,
      priceSar: Number(offerForm.priceSar),
      partCondition: offerForm.partCondition,
      warranty: offerForm.warranty,
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
    if (!carForm.location || !carForm.vehicleBrand || !carForm.modelYear || !carForm.priceSar || !carForm.damageDescription) {
      toast.error("أكمل الحقول الأساسية لبيع السيارة.");
      return;
    }
    const files = await filesToPayload(carFiles);
    await createCarMutation.mutateAsync({
      accessToken,
      vehicleBrand: carForm.vehicleBrand,
      vehicleModel: carForm.modelYear,
      priceSar: Number(carForm.priceSar),
      location: carForm.location,
      damageDescription: carForm.damageDescription,
      files,
    });
  }

  async function handlePurchaseOffer(request: any, offer: any) {
    if (!accessToken) {
      toast.error("سجّل الدخول أولاً.");
      return;
    }

    try {
      if (!request.acceptedOfferId || request.acceptedOfferId !== offer.id) {
        await acceptOfferMutation.mutateAsync({ accessToken, requestId: request.id, offerId: offer.id });
      }
      if (offer.status !== "completed" || request.statusLabel !== "مكتمل") {
        await completeDealMutation.mutateAsync({ accessToken, requestId: request.id, offerId: offer.id });
      }
      setReviewTarget({
        requestId: request.id,
        offerId: offer.id,
        supplierName: offer.supplier?.businessName || offer.supplier?.name || "المورد",
      });
      setActivePanel("review");
      await utils.marketplace.getState.invalidate();
    } catch {
      // handled in mutation callbacks
    }
  }

  async function submitReview() {
    if (!accessToken || !reviewTarget) return;
    await createReviewMutation.mutateAsync({
      accessToken,
      requestId: reviewTarget.requestId,
      offerId: reviewTarget.offerId,
      qualityRating: reviewForm.qualityRating,
      responseSpeedRating: reviewForm.responseSpeedRating,
      priceRating: reviewForm.priceRating,
      comment: reviewForm.comment,
    });
  }

  const liveSuggestionCards = (supplierDashboard?.smartSuggestions ?? []).slice(0, 3) as string[];

  return (
    <div dir="rtl" className="min-h-screen bg-[#e6e7de] px-3 py-5 text-[#121212] sm:px-6">
      <MobileShell>
        <header className="rounded-b-[32px] bg-[#0c8f4a] px-5 pb-7 pt-6 text-white">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-white/75">منصة قطع غيار وسيارات</p>
              <h1 className="mt-1 text-3xl font-black tracking-tight">سوق التشاليح</h1>
            </div>
            <div className="flex items-center gap-2">
              {isSupplierDashboardRoute ? (
                <button type="button" onClick={() => setLocation("/")} className="rounded-full bg-white/12 p-3 text-white transition hover:bg-white/20">
                  <ArrowLeft className="h-5 w-5" />
                </button>
              ) : null}
              {isSignedIn ? (
                <>
                  <button
                    type="button"
                    onClick={() => setIsNotificationTrayOpen((prev) => !prev)}
                    className="relative rounded-full bg-white/12 p-3 text-white transition hover:bg-white/20"
                  >
                    <BellRing className="h-5 w-5" />
                    {unreadNotificationsCount ? (
                      <span className="absolute -left-1 -top-1 rounded-full bg-[#111111] px-1.5 py-0.5 text-[10px] font-black text-white">
                        {unreadNotificationsCount > 9 ? "9+" : unreadNotificationsCount}
                      </span>
                    ) : null}
                  </button>
                  <button type="button" onClick={handleLogout} className="rounded-full bg-white/12 p-3 text-white transition hover:bg-white/20">
                    <LogOut className="h-5 w-5" />
                  </button>
                </>
              ) : (
                <div className="rounded-full bg-white/15 px-4 py-2 text-sm font-medium">+966</div>
              )}
            </div>
          </div>

          {!isSupplierDashboardRoute ? (
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
                  <p className="mt-2 text-xs leading-5 text-white/70">فعّل الطلب الآن وأرسل البيانات واستقبل عروض الموردين داخل التطبيق.</p>
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
                  <p className="mt-2 text-xs leading-5 text-[#6d6d6d]">أضف السيارة المصدومة أو المتضررة مع الموقع والسعر والصور.</p>
                </div>
              </button>
            </div>
          ) : (
            <div className="mt-6 rounded-[28px] bg-white/12 p-4 backdrop-blur-sm">
              <p className="text-sm text-white/80">لوحة تحكم المورد</p>
              <h2 className="mt-1 text-2xl font-black">متابعة الطلبات والعروض والمبيعات</h2>
              <p className="mt-2 text-sm leading-6 text-white/80">نفس الهوية الحالية مع صفحة مخصصة لتحليل أداء المورد والرد على الطلبات المفتوحة بسرعة.</p>
            </div>
          )}
        </header>

        <main className="space-y-4 px-4 pb-6 pt-4">
          {liveBanner ? (
            <SectionCard className="border border-[#0c8f4a]/15 bg-[#eef7f1]">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-[#0c8f4a] p-2 text-white">
                  <BellRing className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-[#0c8f4a]">{liveBanner.title}</p>
                  <p className="mt-1 text-xs leading-5 text-[#385444]">{liveBanner.body}</p>
                </div>
              </div>
            </SectionCard>
          ) : null}

          {isSignedIn && streamState === "degraded" ? (
            <SectionCard className="border border-[#f0c66b] bg-[#fff7df]">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-[#f3c864] p-2 text-[#5f4511]">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-black text-[#6c5317]">تم فقد الاتصال اللحظي مؤقتاً</p>
                  <p className="mt-1 text-xs leading-5 text-[#7d6630]">سيستمر التطبيق بالمزامنة عبر التحديث العادي، وسيحاول المتصفح إعادة الاتصال تلقائياً دون أن تختفي الإشعارات بصمت.</p>
                </div>
              </div>
            </SectionCard>
          ) : null}

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
                <FieldLabel>رقم الجوال</FieldLabel>
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
                    <FieldLabel>رمز التحقق</FieldLabel>
                    <InputField value={otpCode} onChange={(event) => setOtpCode(event.target.value)} inputMode="numeric" placeholder="أدخل 6 أرقام" />
                  </>
                ) : null}

                <button type="button" onClick={otpStep === "phone" ? handleSendOtp : handleVerifyOtp} className="mt-4 w-full rounded-2xl bg-[#111111] px-4 py-3 text-sm font-bold text-white">
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
                  <div className="flex items-center gap-2">
                    <div className="rounded-2xl bg-[#eef7f1] px-3 py-2 text-center text-[#0c8f4a]">
                      <p className="text-[11px] text-[#5f7f69]">غير مقروءة</p>
                      <p className="text-lg font-black">{unreadNotificationsCount}</p>
                    </div>
                    <div className="rounded-2xl bg-[#eef7f1] p-3 text-[#0c8f4a]">
                      {selectedRole === "customer" ? <UserRound className="h-6 w-6" /> : <Store className="h-6 w-6" />}
                    </div>
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

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <StatBox label="طلباتي" value={customerRequests.length} />
                  <StatBox label="سياراتي" value={myCars.length} />
                  <StatBox label="عروضي" value={supplierDashboard.acceptedOffersCount || supplierRequests.length} />
                </div>

                {selectedRole === "supplier" && !isSupplierDashboardRoute ? (
                  <button type="button" onClick={() => setLocation("/supplier/dashboard")} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0c8f4a] px-4 py-3 text-sm font-bold text-white">
                    فتح لوحة المورد
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                ) : null}
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
                  <InputField value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder="الاسم" />
                  <SelectField value={profileCity} onChange={(event) => setProfileCity(event.target.value)} options={allowedCities} placeholder="اختر المدينة" />
                  {selectedRole === "supplier" ? (
                    <>
                      <InputField value={businessName} onChange={(event) => setBusinessName(event.target.value)} placeholder="اسم النشاط أو المؤسسة" />
                      <InputField value={supportedBrands} onChange={(event) => setSupportedBrands(event.target.value)} placeholder="الماركات المدعومة، مثل: تويوتا، نيسان" />
                    </>
                  ) : null}
                </div>
                <button type="button" onClick={handleSaveProfile} className="mt-4 w-full rounded-2xl bg-[#0c8f4a] px-4 py-3 text-sm font-bold text-white">
                  حفظ البيانات
                </button>
              </SectionCard>

              <SectionCard>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold">إشعارات الطلبات</h3>
                    <p className="text-sm text-[#7f7a72]">تظهر العروض الجديدة داخل الحاوية نفسها على الجوال، مع إمكانية تعليمها كمقروءة.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsNotificationTrayOpen((prev) => !prev)}
                    className="rounded-full bg-[#eef7f1] px-4 py-2 text-xs font-bold text-[#0c8f4a]"
                  >
                    {isNotificationTrayOpen ? "إخفاء" : "عرض الكل"}
                  </button>
                </div>
                <div className="mt-4 space-y-3">
                  {notificationItems.length ? (
                    (isNotificationTrayOpen ? notificationItems : notificationItems.slice(0, 2)).map((notification) => {
                      const isUnread = !notification.isRead;
                      return (
                        <button
                          key={notification.id}
                          type="button"
                          onClick={() => {
                            if (isUnread) {
                              markNotificationReadMutation.mutate({ accessToken, notificationId: notification.id });
                            }
                          }}
                          className={`w-full rounded-[24px] border p-4 text-right transition ${isUnread ? "border-[#0c8f4a]/20 bg-[#eef7f1]" : "border-black/5 bg-[#fbfaf7]"}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold text-[#121212]">{notification.title}</p>
                              <p className="mt-1 text-xs leading-5 text-[#6c675f]">{notification.body || "تم استلام عرض جديد على أحد الطلبات."}</p>
                            </div>
                            <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${isUnread ? "bg-[#111111] text-white" : "bg-white text-[#6f6a61]"}`}>
                              {isUnread ? "جديد" : "مقروء"}
                            </span>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#6d675f]">
                            <span>{notification.request?.partName || "طلب قطعة"}</span>
                            <span>{notification.supplier?.businessName || notification.supplier?.name || "أحد الموردين"}</span>
                            <span>{formatNotificationTime(notification.createdAtIso || notification.createdAt)}</span>
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <p className="rounded-2xl bg-[#f6f3eb] px-4 py-5 text-center text-sm text-[#716d64]">لا توجد إشعارات حتى الآن. عند وصول عرض جديد على طلبك سيظهر هنا مباشرة.</p>
                  )}
                </div>
              </SectionCard>

              {isSupplierDashboardRoute ? (
                <>
                  <SectionCard>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-bold">مؤشرات المورد</h3>
                        <p className="text-sm text-[#7d7970]">أربع بطاقات عليا سريعة كما طُلب، مع نفس الأسلوب البصري الحالي.</p>
                      </div>
                      <TrendingUp className="h-5 w-5 text-[#0c8f4a]" />
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <StatBox label="طلبات جديدة" value={supplierDashboard.newRequestsCount || supplierRequests.length} />
                      <StatBox label="عروض مقبولة" value={supplierDashboard.acceptedOffersCount} />
                      <StatBox label="نسبة التحويل" value={`${supplierDashboard.conversionRate}%`} />
                      <StatBox label="إجمالي المبيعات" value={`${supplierDashboard.totalRevenueSar} ر.س`} />
                    </div>
                  </SectionCard>

                  <SectionCard>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-bold">اقتراحات ذكية</h3>
                        <p className="text-sm text-[#7d7970]">بطاقات توصيات قبل نموذج العرض لمساعدة المورد في اختيار أفضل رد.</p>
                      </div>
                      <ShieldCheck className="h-5 w-5 text-[#0c8f4a]" />
                    </div>
                    <div className="mt-4 space-y-3">
                      {liveSuggestionCards.length ? (
                        liveSuggestionCards.map((suggestion) => (
                          <div key={suggestion} className="rounded-[22px] bg-[#f6f3eb] p-4 text-sm leading-6 text-[#534f48]">
                            {suggestion}
                          </div>
                        ))
                      ) : (
                        <div className="rounded-[22px] bg-[#f6f3eb] p-4 text-sm leading-6 text-[#534f48]">ابدأ بإرسال بعض العروض أولاً ليظهر لك مزيد من المقترحات الدقيقة هنا.</div>
                      )}
                    </div>
                  </SectionCard>

                  <SectionCard>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-bold">الرسم البياني للمبيعات</h3>
                        <p className="text-sm text-[#7d7970]">يمكنك التبديل بين يومي وأسبوعي وشهري دون تغيير التصميم.</p>
                      </div>
                      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-[#f5f2ea] p-1">
                        {(["daily", "weekly", "monthly"] as SalesRange[]).map((range) => (
                          <button
                            key={range}
                            type="button"
                            onClick={() => setSalesRange(range)}
                            className={`rounded-xl px-3 py-2 text-xs font-bold ${salesRange === range ? "bg-[#111111] text-white" : "text-[#6b675f]"}`}
                          >
                            {range === "daily" ? "يومي" : range === "weekly" ? "أسبوعي" : "شهري"}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="mt-5 flex h-52 items-end gap-2 rounded-[24px] bg-[#f6f3eb] p-4">
                      {chartItems.length ? (
                        chartItems.map((item) => (
                          <div key={item.label} className="flex flex-1 flex-col items-center justify-end gap-2">
                            <span className="text-[10px] font-bold text-[#6a665f]">{item.value}</span>
                            <div className="w-full rounded-t-[18px] bg-[#0c8f4a]/15">
                              <div className="rounded-t-[18px] bg-[#0c8f4a]" style={{ height: `${Math.max((item.value / chartMax) * 140, 12)}px` }} />
                            </div>
                            <span className="text-[10px] text-[#79756d]">{item.label}</span>
                          </div>
                        ))
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-sm text-[#6d675f]">لا توجد بيانات كافية بعد لعرض الرسم البياني.</div>
                      )}
                    </div>
                  </SectionCard>

                  <SectionCard>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-bold">أفضل الماركات والقطع</h3>
                        <p className="text-sm text-[#7d7970]">جداول سريعة توضح أين يتركز الطلب داخل السوق.</p>
                      </div>
                      <PackageSearch className="h-5 w-5 text-[#0c8f4a]" />
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[24px] bg-[#f6f3eb] p-4">
                        <p className="text-sm font-bold">أعلى الماركات طلباً</p>
                        <div className="mt-3 space-y-2 text-sm text-[#5b5750]">
                          {(supplierDashboard.topBrands ?? []).length ? (
                            supplierDashboard.topBrands.map((item: any, index: number) => (
                              <div key={item.label} className="flex items-center justify-between rounded-2xl bg-white px-3 py-2">
                                <span>{index + 1}. {item.label}</span>
                                <span className="font-bold">{item.count}</span>
                              </div>
                            ))
                          ) : (
                            <div className="rounded-2xl bg-white px-3 py-3 text-center">لم تتكوّن بيانات كافية بعد.</div>
                          )}
                        </div>
                      </div>
                      <div className="rounded-[24px] bg-[#f6f3eb] p-4">
                        <p className="text-sm font-bold">أكثر القطع طلباً</p>
                        <div className="mt-3 space-y-2 text-sm text-[#5b5750]">
                          {(supplierDashboard.topParts ?? []).length ? (
                            supplierDashboard.topParts.map((item: any, index: number) => (
                              <div key={item.label} className="flex items-center justify-between rounded-2xl bg-white px-3 py-2">
                                <span>{index + 1}. {item.label}</span>
                                <span className="font-bold">{item.count}</span>
                              </div>
                            ))
                          ) : (
                            <div className="rounded-2xl bg-white px-3 py-3 text-center">لم تتكوّن بيانات كافية بعد.</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </SectionCard>

                  <SectionCard>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-bold">الطلبات المفتوحة للمورد</h3>
                        <p className="text-sm text-[#7d7970]">من هنا تختار الطلب ثم تفتح نموذج العرض مباشرة.</p>
                      </div>
                      <Store className="h-5 w-5 text-[#0c8f4a]" />
                    </div>
                    <div className="mt-4 space-y-3">
                      {supplierRequests.length ? (
                        supplierRequests.slice(0, 6).map((request) => (
                          <div key={request.id} className="rounded-[24px] bg-[#fbfaf7] p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs text-[#8d887f]">{request.customer?.city || request.city || "السعودية"}</p>
                                <h4 className="mt-1 text-lg font-bold">{request.partName}</h4>
                                <p className="mt-1 text-sm text-[#6b675f]">{request.vehicleBrand} • {request.vehicleYear}</p>
                              </div>
                              <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#0c8f4a]">{request.statusLabel || request.status}</span>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-[#5f5a53]">{request.partDescription || "لا يوجد وصف إضافي من العميل."}</p>
                            <button
                              type="button"
                              onClick={() => {
                                setOfferRequestId(request.id);
                                setActivePanel("offer");
                              }}
                              className="mt-3 rounded-full bg-[#111111] px-4 py-2 text-xs font-bold text-white"
                            >
                              إرسال عرض الآن
                            </button>
                          </div>
                        ))
                      ) : (
                        <p className="rounded-2xl bg-[#f6f3eb] px-4 py-5 text-center text-sm text-[#716d64]">لا توجد طلبات جديدة حالياً للموردين.</p>
                      )}
                    </div>
                  </SectionCard>
                </>
              ) : selectedRole === "customer" ? (
                <>
                  <SectionCard>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-bold">طلباتي</h3>
                        <p className="text-sm text-[#7b786e]">عند فتح الطلب ستجد العروض مع تقييم المورد وأزرار الواتساب وتم الشراء.</p>
                      </div>
                      <PackageSearch className="h-5 w-5 text-[#0c8f4a]" />
                    </div>
                    <div className="mt-4 space-y-3">
                      {customerRequests.length ? (
                        customerRequests.map((request) => (
                          <div key={request.id} className="rounded-[24px] border border-black/5 bg-[#fbfaf7] p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs text-[#8e8a82]">{request.vehicleBrand} • {request.vehicleYear}</p>
                                <h4 className="mt-1 text-lg font-bold">{request.partName}</h4>
                              </div>
                              <span className="rounded-full bg-[#eef7f1] px-3 py-1 text-xs font-bold text-[#0c8f4a]">{request.statusLabel || request.status}</span>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-[#5e5b55]">{request.partDescription || "لا يوجد وصف إضافي."}</p>
                            <ImageStrip images={request.imageUrls ?? []} />
                            <div className="mt-3 space-y-3">
                              {(request.offers ?? []).length ? (
                                request.offers.map((offer: any) => {
                                  const whatsappUrl = offer.whatsappUrl || buildWhatsappLink(offer.whatsappNumber, request.partName, offer.priceSar);
                                  return (
                                    <div key={offer.id} className="rounded-2xl bg-white p-3 shadow-sm">
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                          <p className="text-sm font-bold">{offer.supplier?.businessName || offer.supplier?.name || "مورد"}</p>
                                          <div className="mt-1 flex items-center gap-2 text-xs text-[#7a766d]">
                                            <RatingStars value={offer.supplierAverageRating || offer.averageRating || 0} />
                                            <span>{Number(offer.supplierAverageRating ?? offer.averageRating ?? 0).toFixed(1)}</span>
                                          </div>
                                        </div>
                                        <div className="text-left">
                                          <p className="text-lg font-black">{offer.priceSar} ر.س</p>
                                          <p className="text-xs text-[#7a766d]">{offer.statusLabel || offer.status}</p>
                                        </div>
                                      </div>
                                      <p className="mt-2 text-xs leading-5 text-[#6b675f]">{offer.offerDescription || "عرض سعر مرفق مع وصف وصور القطعة."}</p>
                                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#6d675f]">
                                        <span className="rounded-full bg-[#f5f2ea] px-3 py-1">الحالة: {offer.partConditionLabel || offer.partCondition}</span>
                                        <span className="rounded-full bg-[#f5f2ea] px-3 py-1">الضمان: {offer.warranty || "غير مذكور"}</span>
                                      </div>
                                      <ImageStrip images={offer.imageUrls ?? []} />
                                      <div className="mt-3 flex flex-wrap gap-2">
                                        <a
                                          href={whatsappUrl ?? "#"}
                                          target="_blank"
                                          rel="noreferrer"
                                          onClick={(event) => {
                                            if (!whatsappUrl) {
                                              event.preventDefault();
                                              toast.error("هذا العرض لا يحتوي على رقم واتساب صالح.");
                                            }
                                          }}
                                          className="rounded-full bg-[#0c8f4a] px-4 py-2 text-xs font-bold text-white"
                                        >
                                          تواصل واتساب
                                        </a>
                                        <button
                                          type="button"
                                          onClick={() => handlePurchaseOffer(request, offer)}
                                          className="rounded-full bg-[#111111] px-4 py-2 text-xs font-bold text-white"
                                        >
                                          تم الشراء
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })
                              ) : (
                                <p className="rounded-2xl bg-white px-4 py-4 text-center text-sm text-[#716d64]">لا توجد عروض على هذا الطلب حتى الآن.</p>
                              )}
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
                        <p className="text-sm text-[#7e7a72]">قسم بيع السيارات المصدومة أو المتضررة مع الصور والسعر المطلوب.</p>
                      </div>
                      <CircleDollarSign className="h-5 w-5 text-[#0c8f4a]" />
                    </div>
                    <div className="mt-4 space-y-3">
                      {publicCars.length ? (
                        publicCars.map((car) => (
                          <div key={`${car.sourceType || "car"}-${car.id}`} className="rounded-[24px] bg-[#fbfaf7] p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs text-[#8d887f]">{car.owner?.name || car.owner?.phoneNumber || "مالك السيارة"}</p>
                                <h4 className="mt-1 text-lg font-bold">{car.vehicleBrand} {car.vehicleModel}</h4>
                              </div>
                              <span className="rounded-full bg-white px-3 py-1 text-sm font-black">{car.askingPriceSar || car.priceSar} ر.س</span>
                            </div>
                            <p className="mt-2 text-sm text-[#5c5850]">{car.location || car.city || "داخل السعودية"}</p>
                            <p className="mt-1 text-sm leading-6 text-[#726e66]">{car.damageDescription || car.description || "لا يوجد وصف إضافي."}</p>
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
                        <p className="text-sm text-[#7b786e]">اطلع على الطلبات المفتوحة وقدّم سعرك مع الضمان والصور ورقم الواتساب.</p>
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
                                <p className="mt-1 text-sm text-[#6b675f]">{request.vehicleBrand} • {request.vehicleYear}</p>
                              </div>
                              <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#0c8f4a]">{request.statusLabel || request.status}</span>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-[#5f5a53]">{request.partDescription || "لا يوجد وصف إضافي من العميل."}</p>
                            <ImageStrip images={request.imageUrls ?? []} />
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setOfferRequestId(request.id);
                                  setActivePanel("offer");
                                }}
                                className="rounded-full bg-[#111111] px-4 py-2 text-xs font-bold text-white"
                              >
                                تقديم عرض سعر
                              </button>
                              <button type="button" onClick={() => setLocation("/supplier/dashboard")} className="rounded-full bg-[#eef7f1] px-4 py-2 text-xs font-bold text-[#0c8f4a]">
                                عرض اللوحة
                              </button>
                            </div>
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
                        <h3 className="text-lg font-bold">تقييمات المورد</h3>
                        <p className="text-sm text-[#7d7970]">يتم تحديث متوسط المورد تلقائياً بعد كل عملية شراء وتقييم.</p>
                      </div>
                      <Star className="h-5 w-5 text-[#0c8f4a]" />
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <StatBox label="طلبات متاحة" value={supplierRequests.length} />
                      <StatBox label="تقييمات" value={myReviews.length} />
                      <StatBox label="المبيعات" value={`${supplierDashboard.totalRevenueSar} ر.س`} />
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
                  <h3 className="text-lg font-bold">طلب قطعة جديدة</h3>
                  <p className="text-sm text-[#7c776e]">أدخل البيانات المطلوبة فقط دون كتابة حرة في نوع السيارة أو المدينة.</p>
                </div>
                <button type="button" onClick={() => setActivePanel(null)} className="text-sm text-[#78746b]">إغلاق</button>
              </div>
              <div className="mt-4 grid gap-3">
                <div>
                  <FieldLabel>نوع السيارة</FieldLabel>
                  <SelectField value={requestForm.vehicleBrand} onChange={(event) => setRequestForm((prev) => ({ ...prev, vehicleBrand: event.target.value }))} options={allowedVehicleTypes} placeholder="اختر نوع السيارة" />
                </div>
                <div>
                  <FieldLabel>الموديل</FieldLabel>
                  <InputField value={requestForm.modelYear} onChange={(event) => setRequestForm((prev) => ({ ...prev, modelYear: event.target.value }))} inputMode="numeric" placeholder="مثال 2020" />
                </div>
                <div>
                  <FieldLabel>نوع القطعة</FieldLabel>
                  <InputField value={requestForm.partName} onChange={(event) => setRequestForm((prev) => ({ ...prev, partName: event.target.value }))} placeholder="مثال: صدام أمامي" />
                </div>
                <div>
                  <FieldLabel>المدينة</FieldLabel>
                  <SelectField value={requestForm.city} onChange={(event) => setRequestForm((prev) => ({ ...prev, city: event.target.value }))} options={allowedCities} placeholder="اختر المدينة" />
                </div>
                <div>
                  <FieldLabel>وصف إضافي</FieldLabel>
                  <TextAreaField value={requestForm.partDescription} onChange={(event) => setRequestForm((prev) => ({ ...prev, partDescription: event.target.value }))} placeholder="أضف أي تفاصيل مهمة عن القطعة المطلوبة." />
                </div>
                <div>
                  <FieldLabel>رفع صورة (اختياري)</FieldLabel>
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-[#0c8f4a]/25 bg-[#f6f3eb] px-4 py-4 text-sm font-medium text-[#0c8f4a]">
                    <ImagePlus className="h-5 w-5" />
                    اختر صورة للقطعة أو السيارة
                    <input type="file" accept="image/*" multiple className="hidden" onChange={(event) => setRequestFiles(Array.from(event.target.files ?? []))} />
                  </label>
                  <p className="mt-2 text-xs text-[#7b776f]">تم اختيار {requestFiles.length} ملف.</p>
                </div>
                <div className="rounded-[24px] border border-[#f0c66b] bg-[#fff7df] p-4 text-sm leading-6 text-[#6b5317]">
                  <span className="font-black">تنبيه هام جداً:</span> المنصة وسيط فقط. لا تتحمل مسؤولية جودة القطع أو إتمام الدفع. تأكد من القطعة قبل الدفع.
                </div>
                <button type="button" onClick={submitRequest} className="w-full rounded-2xl bg-[#111111] px-4 py-3 text-sm font-bold text-white">
                  إرسال الطلب
                </button>
              </div>
            </SectionCard>
          ) : null}

          {activePanel === "car" ? (
            <SectionCard className="border-2 border-[#0c8f4a]/10">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold">بيع سيارة مصدومة</h3>
                  <p className="text-sm text-[#7c776e]">أدخل الموقع والماركة والموديل والسعر المطلوب وصور السيارة ووصف الضرر.</p>
                </div>
                <button type="button" onClick={() => setActivePanel(null)} className="text-sm text-[#78746b]">إغلاق</button>
              </div>
              <div className="mt-4 grid gap-3">
                <div>
                  <FieldLabel>الموقع</FieldLabel>
                  <SelectField value={carForm.location} onChange={(event) => setCarForm((prev) => ({ ...prev, location: event.target.value }))} options={allowedCities} placeholder="اختر الموقع" />
                </div>
                <div>
                  <FieldLabel>الماركة</FieldLabel>
                  <SelectField value={carForm.vehicleBrand} onChange={(event) => setCarForm((prev) => ({ ...prev, vehicleBrand: event.target.value }))} options={allowedVehicleTypes} placeholder="اختر الماركة" />
                </div>
                <div>
                  <FieldLabel>الموديل</FieldLabel>
                  <InputField value={carForm.modelYear} onChange={(event) => setCarForm((prev) => ({ ...prev, modelYear: event.target.value }))} inputMode="numeric" placeholder="مثال 2020" />
                </div>
                <div>
                  <FieldLabel>السعر المطلوب</FieldLabel>
                  <InputField value={carForm.priceSar} onChange={(event) => setCarForm((prev) => ({ ...prev, priceSar: event.target.value }))} inputMode="numeric" placeholder="بالريال السعودي" />
                </div>
                <div>
                  <FieldLabel>وصف الضرر</FieldLabel>
                  <TextAreaField value={carForm.damageDescription} onChange={(event) => setCarForm((prev) => ({ ...prev, damageDescription: event.target.value }))} placeholder="صف جهة الضرر والحالة العامة للسيارة." />
                </div>
                <div>
                  <FieldLabel>صور السيارة</FieldLabel>
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-[#0c8f4a]/25 bg-[#f6f3eb] px-4 py-4 text-sm font-medium text-[#0c8f4a]">
                    <ImagePlus className="h-5 w-5" />
                    اختر صور السيارة
                    <input type="file" accept="image/*" multiple className="hidden" onChange={(event) => setCarFiles(Array.from(event.target.files ?? []))} />
                  </label>
                  <p className="mt-2 text-xs text-[#7b776f]">تم اختيار {carFiles.length} ملف.</p>
                </div>
                <button type="button" onClick={submitCarSale} className="w-full rounded-2xl bg-[#111111] px-4 py-3 text-sm font-bold text-white">
                  حفظ السيارة
                </button>
              </div>
            </SectionCard>
          ) : null}

          {activePanel === "offer" ? (
            <SectionCard className="border-2 border-[#0c8f4a]/10">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold">إرسال عرض مورد</h3>
                  <p className="text-sm text-[#7c776e]">قبل النموذج ستجد مساعداً سريعاً ونقاطاً ذكية من بيانات السوق الحالية.</p>
                </div>
                <button type="button" onClick={() => setActivePanel(null)} className="text-sm text-[#78746b]">إغلاق</button>
              </div>

              <div className="mt-4 rounded-[24px] bg-[#f6f3eb] p-4">
                <p className="text-sm font-black text-[#1d1c18]">المساعد الذكي للمورد</p>
                <p className="mt-2 text-xs leading-5 text-[#666157]">
                  {selectedRequestForOffer
                    ? `الطلب الحالي لقطعة ${selectedRequestForOffer.partName} على سيارة ${selectedRequestForOffer.vehicleBrand} موديل ${selectedRequestForOffer.vehicleYear}. أضف وصفاً واضحاً، مدة ضمان مختصرة، ورقم واتساب صحيح لرفع فرصة القبول.`
                    : "اختر طلباً من القائمة أولاً حتى تظهر لك أفضل توصيات الرد والسعر والوصف."}
                </p>
                <div className="mt-3 space-y-2">
                  {liveSuggestionCards.length ? (
                    liveSuggestionCards.map((suggestion) => (
                      <div key={suggestion} className="rounded-2xl bg-white px-3 py-3 text-xs leading-5 text-[#5c5850]">
                        {suggestion}
                      </div>
                    ))
                  ) : null}
                </div>
              </div>

              <div className="mt-4 grid gap-3">
                <div>
                  <FieldLabel>السعر</FieldLabel>
                  <InputField value={offerForm.priceSar} onChange={(event) => setOfferForm((prev) => ({ ...prev, priceSar: event.target.value }))} inputMode="numeric" placeholder="أدخل السعر بالريال" />
                </div>
                <div>
                  <FieldLabel>حالة القطعة</FieldLabel>
                  <select value={offerForm.partCondition} onChange={(event) => setOfferForm((prev) => ({ ...prev, partCondition: event.target.value as "new" | "used" | "refurbished" }))} className="w-full rounded-2xl bg-[#f6f3eb] px-4 py-3 outline-none">
                    <option value="new">جديدة</option>
                    <option value="used">مستعملة</option>
                    <option value="refurbished">مجددة</option>
                  </select>
                </div>
                <div>
                  <FieldLabel>مدة الضمان</FieldLabel>
                  <InputField value={offerForm.warranty} onChange={(event) => setOfferForm((prev) => ({ ...prev, warranty: event.target.value }))} placeholder="مثال: 7 أيام فحص" />
                </div>
                <div>
                  <FieldLabel>رقم واتساب المورد</FieldLabel>
                  <InputField value={offerForm.whatsappNumber} onChange={(event) => setOfferForm((prev) => ({ ...prev, whatsappNumber: event.target.value }))} placeholder="05xxxxxxxx" />
                </div>
                <div>
                  <FieldLabel>وصف العرض</FieldLabel>
                  <TextAreaField value={offerForm.offerDescription} onChange={(event) => setOfferForm((prev) => ({ ...prev, offerDescription: event.target.value }))} placeholder="اشرح حالة القطعة ومدى توفرها ووقت التسليم." />
                </div>
                <div>
                  <FieldLabel>صور القطعة</FieldLabel>
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-[#0c8f4a]/25 bg-[#f6f3eb] px-4 py-4 text-sm font-medium text-[#0c8f4a]">
                    <ImagePlus className="h-5 w-5" />
                    اختر صور القطعة
                    <input type="file" accept="image/*" multiple className="hidden" onChange={(event) => setOfferFiles(Array.from(event.target.files ?? []))} />
                  </label>
                  <p className="mt-2 text-xs text-[#7b776f]">تم اختيار {offerFiles.length} ملف.</p>
                </div>
                <button type="button" onClick={submitOffer} className="w-full rounded-2xl bg-[#111111] px-4 py-3 text-sm font-bold text-white">
                  حفظ العرض وإرسال الإشعار
                </button>
              </div>
            </SectionCard>
          ) : null}

          {activePanel === "review" ? (
            <SectionCard className="border-2 border-[#0c8f4a]/10">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold">تقييم المورد</h3>
                  <p className="text-sm text-[#7c776e]">قيّم الجودة وسرعة الرد والسعر بعد الضغط على تم الشراء.</p>
                </div>
                <button type="button" onClick={() => setActivePanel(null)} className="text-sm text-[#78746b]">إغلاق</button>
              </div>
              <div className="mt-4 rounded-[24px] bg-[#f6f3eb] p-4 text-sm leading-6 text-[#56524b]">
                أنت الآن تقيّم <span className="font-black">{reviewTarget?.supplierName || "المورد"}</span>. سيُحتسب متوسط التقييم تلقائياً في لوحة المورد وبطاقات العروض.
              </div>
              <div className="mt-4 space-y-3">
                <StarPicker label="جودة القطعة" value={reviewForm.qualityRating} onChange={(next) => setReviewForm((prev) => ({ ...prev, qualityRating: next }))} />
                <StarPicker label="سرعة الرد" value={reviewForm.responseSpeedRating} onChange={(next) => setReviewForm((prev) => ({ ...prev, responseSpeedRating: next }))} />
                <StarPicker label="السعر" value={reviewForm.priceRating} onChange={(next) => setReviewForm((prev) => ({ ...prev, priceRating: next }))} />
                <div>
                  <FieldLabel>تعليق اختياري</FieldLabel>
                  <TextAreaField value={reviewForm.comment} onChange={(event) => setReviewForm((prev) => ({ ...prev, comment: event.target.value }))} placeholder="أضف ملاحظتك عن التجربة إن رغبت." />
                </div>
                <button type="button" onClick={submitReview} className="w-full rounded-2xl bg-[#111111] px-4 py-3 text-sm font-bold text-white">
                  حفظ التقييم
                </button>
              </div>
            </SectionCard>
          ) : null}

          {isBusy ? (
            <div className="flex items-center justify-center gap-2 py-2 text-sm text-[#6b675f]">
              <Loader2 className="h-4 w-4 animate-spin" />
              جارٍ تنفيذ الطلب...
            </div>
          ) : null}
        </main>
      </MobileShell>
    </div>
  );
}
