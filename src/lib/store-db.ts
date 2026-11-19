import type { Dish } from "@/lib/data";

export type Deal = {
  id: number;
  title: string;
  description: string;
  regularPrice: number;
  discountedPrice: number;
  imageUrl: string;
  available?: boolean;
};

export type StoreSettings = {
  restaurant: {
    name: string;
    description: string;
    phone: string;
    whatsapp: string;
    email: string;
    address: string;
    logoUrl: string;
    isOpen: boolean;
  };
  delivery: {
    baseFee: number;
    freeDeliveryThreshold: number;
    estimatedDeliveryTime: string;
    deliveryRadiusKm: number;
    minOrderAmount: number;
    deliveryAreas: string[];
  };
  payments: {
    cashOnDelivery: boolean;
    raastQrUrl: string;
    raastMerchantName: string;
    raastRef: string;
    bankName: string;
    bankAccountTitle: string;
    bankIban: string;
    taxPercentage: number;
    paymentInstructions: string;
  };
  businessHours: {
    schedule: Record<string, { open: string; close: string; enabled: boolean }>;
    mealSlots: Array<{ name: "Breakfast" | "Lunch" | "Dinner"; open: string; close: string; enabled: boolean }>;
    holidayMode: boolean;
    holidayMessage: string;
    slotDurationMinutes: number;
    slots: string[];
  };
  social: {
    facebook: string;
    instagram: string;
    whatsappBusiness: string;
    tiktok: string;
    supportEmail: string;
  };
  account: {
    adminEmails: string[];
    notificationEmails: string[];
    sessionTimeoutHours: number;
    twoFactorEnabled: boolean;
    pinCode: string;
  };
};

export type DbCustomer = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
  authProvider: "google" | "email" | "phone";
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt?: string;
  addresses?: string[];
  notes?: string;
  favoriteDishIds?: number[];
};

export type DbOrderItem = {
  id: number;
  name: string;
  portion: string;
  price: number;
  quantity: number;
  specialInstructions?: string;
};

export type DbOrderStatus = "pending" | "new" | "confirmed" | "preparing" | "ready" | "out_for_delivery" | "delivering" | "arriving" | "delivered" | "completed" | "cancelled";
export type DbPaymentStatus = "pending" | "verification_pending" | "paid" | "rejected";

export type DbOrder = {
  id: string;
  number: string;
  customerName: string;
  customerEmail?: string;
  customerPhone: string;
  area: string;
  address: string;
  notes?: string;
  paymentMethod: string;
  items: DbOrderItem[];
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  status: DbOrderStatus;
  paymentStatus: DbPaymentStatus;
  paymentSlipUrl?: string;
  paymentSlipName?: string;
  customerNote?: string;
  adminNotes?: string;
  adminMediaUrl?: string;
  cancellationReason?: string;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
  riderName?: string;
  riderPhone?: string;
  estimatedDelivery?: string;
};

export type DbOrderMessage = {
  id: string;
  orderNumber: string;
  sender: "customer" | "admin";
  body: string;
  createdAt: string;
};

// Database row shapes only. All reads and writes go through Supabase APIs.
export type MenuItem = Dish;
