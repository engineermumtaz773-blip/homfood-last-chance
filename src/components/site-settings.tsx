"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type Locale = "en" | "ur" | "sd" | "ur-Latn";
export type Theme = "light" | "dark" | "pink" | "emerald" | "sunset";
const localeNames: Record<Locale, string> = { en: "English", ur: "اردو", sd: "سنڌي", "ur-Latn": "Roman Urdu" };
const themeNames: Record<Theme, string> = { light: "Light", dark: "Dark", pink: "Signature Pink", emerald: "Emerald Kitchen", sunset: "Sunset Amber" };
const rtlLocales = new Set<Locale>(["ur", "sd"]);
const translations: Record<Locale, Record<string, string>> = {
  en: { menu: "Menu", deals: "Daily Deals", track: "Track order", profile: "Profile", search: "Search", searchPlaceholder: "Search dishes...", delivering: "Delivering to", deliveryArea: "Delivery area", homeKicker: "HOMEMADE IN BAHAWALPUR", homeTitle: "Good food. Feels like home.", homeDescription: "Freshly prepared, comforting meals made with care and delivered to your door.", orderFavorites: "Order your favourites", deliveryNote: "Delivering across Bahawalpur", exploreMenu: "Explore our menu", seeFullMenu: "See full menu", cravings: "WHAT ARE YOU CRAVING?", browseDishes: "Browse all dishes", portion: "Choose your portion", customize: "Customize order", add: "Add", language: "Language", theme: "Theme", all: "All dishes", breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", fastFood: "Fast Food", desserts: "Desserts & Drinks", traditional: "Traditional", snacks: "Snacks", sides: "Sides", vegetarian: "Vegetarian", spicy: "Spicy", unavailable: "Currently unavailable", available: "Available today", rating: "rating", weight: "Serving", searchMenu: "Search menu", todayDeals: "Today's Daily Deals", freshMenu: "Fresh Homemade Menu", menuIntro: "Prepared fresh daily in Bahawalpur. Find a favourite and choose your portion.", dealsIntro: "Freshly prepared combinations, with a little something saved.", quantity: "Quantity", instructions: "Special instructions", cart: "View cart", menuKicker: "Our Full Kitchen Selection", checkoutKicker: "Almost there", checkoutTitle: "Checkout", checkoutIntro: "Share your delivery details and confirm your order with us.", trackKicker: "Order updates", trackTitle: "Track your order", trackIntro: "See your request details and contact our team for a confirmed update.", dealsKicker: "Made for sharing" },
  ur: { menu: "کھانے", deals: "آج کی ڈیلز", track: "آرڈر کی صورتحال", profile: "پروفائل", search: "تلاش", searchPlaceholder: "کھانے تلاش کریں...", delivering: "ترسیل کا پتہ", deliveryArea: "علاقہ منتخب کریں", homeKicker: "بہاولپور کا گھریلو کھانا", homeTitle: "مزیدار کھانا، گھر جیسا ذائقہ", homeDescription: "تازہ تیار کردہ آرام دہ کھانے، محبت سے بنا کر آپ کے دروازے تک پہنچائے جاتے ہیں۔", orderFavorites: "اپنی پسند کا آرڈر کریں", deliveryNote: "پورے بہاولپور میں ترسیل", exploreMenu: "ہمارا مینو دیکھیں", seeFullMenu: "پورا مینو دیکھیں", cravings: "آج کیا کھانے کا دل ہے؟", browseDishes: "تمام کھانے دیکھیں", portion: "اپنی مقدار منتخب کریں", customize: "آرڈر کی تفصیل", add: "شامل کریں", language: "زبان", theme: "رنگ", all: "تمام کھانے", breakfast: "ناشتہ", lunch: "دوپہر کا کھانا", dinner: "رات کا کھانا", fastFood: "فاسٹ فوڈ", desserts: "مٹھائیاں اور مشروبات", traditional: "روایتی", vegetarian: "سبزی خور", spicy: "مرچ مصالحہ", unavailable: "فی الحال دستیاب نہیں", available: "آج دستیاب ہے", rating: "ریٹنگ", weight: "مقدار", searchMenu: "مینو تلاش کریں", todayDeals: "آج کی خصوصی ڈیلز", freshMenu: "تازہ گھریلو مینو", menuIntro: "بہاولپور میں روزانہ تازہ تیار کیا جاتا ہے۔ اپنی پسند کا کھانا اور مقدار منتخب کریں۔", dealsIntro: "تازہ تیار کردہ کھانے کے امتزاج، خصوصی بچت کے ساتھ۔", quantity: "تعداد", instructions: "خاص ہدایات", cart: "ٹوکری دیکھیں", menuKicker: "ہمارے باورچی خانے کا انتخاب", checkoutKicker: "بس مکمل ہونے والا ہے", checkoutTitle: "چیک آؤٹ", checkoutIntro: "اپنی ترسیل کی تفصیل دیں اور آرڈر کی تصدیق کریں۔", trackKicker: "آرڈر کی تازہ صورتحال", trackTitle: "اپنا آرڈر دیکھیں", trackIntro: "اپنے آرڈر کی تفصیل دیکھیں اور تازہ معلومات کے لیے ہم سے رابطہ کریں۔", dealsKicker: "سب کے ساتھ بانٹنے کے لیے" },
  sd: { menu: "کاڌو", deals: "اڄ جون آڇون", track: "آرڊر جي حالت", profile: "پروفائل", search: "ڳولا", searchPlaceholder: "کاڌا ڳوليو...", delivering: "پهچائڻ جو پتو", deliveryArea: "علائقو چونڊيو", homeKicker: "بهاولپور جو گهر جو کاڌو", homeTitle: "سٺو کاڌو، گهر جهڙو ذائقو", homeDescription: "تازو تيار ڪيل آرامده کاڌا، پيار سان ٺاهي اوهان جي در تي پهچايا وڃن ٿا.", orderFavorites: "پنهنجا پسنديده آرڊر ڪريو", deliveryNote: "سڄي بهاولپور ۾ پهچائڻ", exploreMenu: "اسان جو مينيو ڏسو", seeFullMenu: "سڄو مينيو ڏسو", cravings: "اڄ ڇا کائڻ چاهيو ٿا؟", browseDishes: "سڀ کاڌا ڏسو", portion: "پنهنجو حصو چونڊيو", customize: "آرڊر ترتيب ڏيو", add: "شامل ڪريو", language: "ٻولي", theme: "رنگ", all: "سڀ کاڌا", breakfast: "ناشتو", lunch: "منجهند جو کاڌو", dinner: "رات جو کاڌو", fastFood: "فاسٽ فوڊ", desserts: "مٺايون ۽ مشروب", traditional: "روايتي", vegetarian: "سبزي وارو", spicy: "مرچ مصالحو", unavailable: "هن وقت موجود ناهي", available: "اڄ موجود آهي", rating: "درجه بندي", weight: "مقدار", searchMenu: "مينيو ڳوليو", todayDeals: "اڄ جون خاص آڇون", freshMenu: "تازو گهر جو مينيو", menuIntro: "بهاولپور ۾ هر روز تازو تيار. پسنديده کاڌو ۽ مقدار چونڊيو.", dealsIntro: "تازو تيار ڪيل کاڌن جا مجموعا، خاص بچت سان.", quantity: "تعداد", instructions: "خاص هدايتون", cart: "ٽوڪري ڏسو", menuKicker: "اسان جي باورچی خاني جو انتخاب", checkoutKicker: "آرڊر مڪمل ٿيڻ وارو آهي", checkoutTitle: "چيڪ آئوٽ", checkoutIntro: "پهچائڻ جي ڄاڻ ڏيو ۽ آرڊر جي تصديق ڪريو.", trackKicker: "آرڊر جون تازه ڪاريون", trackTitle: "آرڊر ڏسو", trackIntro: "آرڊر جي ڄاڻ ڏسو ۽ نئين حالت لاءِ اسان سان رابطو ڪريو.", dealsKicker: "گڏجي کائڻ لاءِ" },
  "ur-Latn": { menu: "Menu", deals: "Aaj Ki Deals", track: "Order Track Karen", profile: "Profile", search: "Talash", searchPlaceholder: "Khanay dhoondein...", delivering: "Delivery ka pata", deliveryArea: "Delivery area", homeKicker: "BAHAWALPUR KA GHAR KA KHANA", homeTitle: "Mazedar khana. Ghar jaisa zaiqa.", homeDescription: "Taaza ghar ke khanay, pyaar se tayyar aur aap ke darwazay tak.", orderFavorites: "Apni pasand ka order karein", deliveryNote: "Pooray Bahawalpur mein delivery", exploreMenu: "Hamara menu dekhein", seeFullMenu: "Poora menu dekhein", cravings: "Aaj kya khanay ka dil hai?", browseDishes: "Tamam khanay dekhein", portion: "Apni miqdaar chunein", customize: "Order ki tafseel", add: "Shamil karein", language: "Zabaan", theme: "Theme", all: "Tamam khanay", breakfast: "Nashta", lunch: "Dopahar ka khana", dinner: "Raat ka khana", fastFood: "Fast Food", desserts: "Mithai aur mashroobat", traditional: "Riwayati", vegetarian: "Sabzi wala", spicy: "Chatpata", unavailable: "Filhaal dastiyab nahin", available: "Aaj dastiyab hai", rating: "rating", weight: "Miqdaar", searchMenu: "Menu talash karein", todayDeals: "Aaj Ki Khaas Deals", freshMenu: "Taaza Ghar Ka Menu", menuIntro: "Bahawalpur mein rozana taaza tayyar. Pasandeeda khana aur miqdaar chunein.", dealsIntro: "Taaza tayyar kiye gaye khanay ke combos, khaas bachat ke saath.", quantity: "Tadaad", instructions: "Khaas hidayaat", cart: "Cart dekhein", menuKicker: "Hamari kitchen ka intikhab", checkoutKicker: "Bas ho gaya", checkoutTitle: "Checkout", checkoutIntro: "Delivery ki tafseel dein aur order confirm karein.", trackKicker: "Order updates", trackTitle: "Apna order track karein", trackIntro: "Order ki tafseel dekhein aur update ke liye hum se rabta karein.", dealsKicker: "Sab ke saath share karne ke liye" },
};

Object.assign(translations.en, { customerInfo: "Customer Information", fullName: "Full name", phoneNumber: "Phone number", chooseArea: "Select your area", fullAddress: "Complete address", paymentMethod: "Payment Method", additionalNotes: "Additional notes", orderSummary: "Order Summary", subtotal: "Subtotal", promoCode: "Promo code", enterCode: "Enter code", apply: "Apply", remove: "Remove", submitOrder: "Submit order & continue to WhatsApp →", emptyCart: "Your cart is empty.", browseMenu: "Browse the menu", orderPlaced: "Order placed", cooking: "Cooking", onTheWay: "On the way", arriving: "Arriving", orderReceived: "Order received", cookingOrder: "Cooking your order", readyDelivery: "Ready for delivery", arrivingSoon: "Arriving soon", delivered: "Delivered", cancelled: "Cancelled", orderUpdates: "ORDER UPDATES", keepLoop: "We'll keep you in the loop", orderNumber: "Order number", phoneUsed: "Phone number used", checkStatus: "Check live status", menuStock: "Menu availability" });
Object.assign(translations.ur, { customerInfo: "صارف کی معلومات", fullName: "پورا نام", phoneNumber: "فون نمبر", chooseArea: "اپنا علاقہ منتخب کریں", fullAddress: "مکمل پتہ", paymentMethod: "ادائیگی کا طریقہ", additionalNotes: "اضافی ہدایات", orderSummary: "آرڈر کا خلاصہ", subtotal: "ذیلی رقم", promoCode: "پرومو کوڈ", enterCode: "کوڈ درج کریں", apply: "لگائیں", remove: "ہٹائیں", submitOrder: "آرڈر بھیجیں اور واٹس ایپ جاری رکھیں →", emptyCart: "آپ کی ٹوکری خالی ہے۔", browseMenu: "مینو دیکھیں", orderPlaced: "آرڈر درج ہوا", cooking: "تیار ہو رہا ہے", onTheWay: "راستے میں ہے", arriving: "پہنچ رہا ہے", orderReceived: "آرڈر موصول ہوا", cookingOrder: "آپ کا کھانا تیار ہو رہا ہے", readyDelivery: "ترسیل کے لیے تیار", arrivingSoon: "جلد پہنچے گا", delivered: "پہنچا دیا گیا", cancelled: "منسوخ", orderUpdates: "آرڈر کی تازہ صورتحال", keepLoop: "ہم آپ کو باخبر رکھیں گے", orderNumber: "آرڈر نمبر", phoneUsed: "استعمال شدہ فون نمبر", checkStatus: "تازہ صورتحال دیکھیں" });
Object.assign(translations.sd, { customerInfo: "گراهڪ جي ڄاڻ", fullName: "پورو نالو", phoneNumber: "فون نمبر", chooseArea: "پنهنجو علائقو چونڊيو", fullAddress: "مڪمل پتو", paymentMethod: "ادائيگي جو طريقو", additionalNotes: "وڌيڪ هدايتون", orderSummary: "آرڊر جو خلاصو", subtotal: "ذيلي رقم", promoCode: "پرومو ڪوڊ", enterCode: "ڪوڊ لکو", apply: "لاڳو ڪريو", remove: "هٽايو", submitOrder: "آرڊر موڪليو ۽ واٽس ايپ جاري رکو →", emptyCart: "توهان جي ٽوڪري خالي آهي.", browseMenu: "مينيو ڏسو", orderPlaced: "آرڊر داخل ٿيو", cooking: "تيار ٿي رهيو آهي", onTheWay: "رستي ۾ آهي", arriving: "پهچي رهيو آهي", orderReceived: "آرڊر مليو", cookingOrder: "توهان جو کاڌو تيار ٿي رهيو آهي", readyDelivery: "پهچائڻ لاءِ تيار", arrivingSoon: "جلد پهچي ويندو", delivered: "پهچايو ويو", cancelled: "منسوخ", orderUpdates: "آرڊر جون تازه ڪاريون", keepLoop: "اسان اوهان کي باخبر رکنداسين", orderNumber: "آرڊر نمبر", phoneUsed: "استعمال ٿيل فون نمبر", checkStatus: "تازي حالت ڏسو" });
Object.assign(translations["ur-Latn"], { customerInfo: "Customer ki tafseel", fullName: "Poora naam", phoneNumber: "Phone number", chooseArea: "Apna ilaqa chunein", fullAddress: "Mukammal pata", paymentMethod: "Payment ka tareeqa", additionalNotes: "Mazeed hidayaat", orderSummary: "Order ka khulasa", subtotal: "Subtotal", promoCode: "Promo code", enterCode: "Code likhein", apply: "Apply karein", remove: "Hatayein", submitOrder: "Order bhejein aur WhatsApp jari rakhein →", emptyCart: "Aap ka cart khaali hai.", browseMenu: "Menu dekhein", orderPlaced: "Order ho gaya", cooking: "Tayyar ho raha hai", onTheWay: "Raastay mein hai", arriving: "Pohnch raha hai", orderReceived: "Order mil gaya", cookingOrder: "Aap ka khana tayyar ho raha hai", readyDelivery: "Delivery ke liye tayyar", arrivingSoon: "Jald pohnchay ga", delivered: "Pohncha diya gaya", cancelled: "Mansookh", orderUpdates: "Order updates", keepLoop: "Hum aap ko update dete rahenge", orderNumber: "Order number", phoneUsed: "Istemaal shuda phone number", checkStatus: "Live status dekhein" });

Object.assign(translations.en, {
  reservationEyebrow: "TABLE RESERVATIONS",
  reservationPageTitle: "Gather around homemade food.",
  reservationPageDescription: "Send a reservation request for your group. We will confirm your time by phone.",
  reservationTitle: "Request a table",
  reservationName: "Your name",
  reservationPhone: "Phone",
  reservationGuests: "Guests",
  reservationDateTime: "Date and time",
  reservationNotes: "Notes",
  reservationNotesPlaceholder: "Accessibility needs or special requests (optional)",
  reservationSaving: "Submitting…",
  reservationSubmit: "Request reservation",
  reservationSuccess: "Reservation request submitted. We will confirm by phone.",
  subscriptionsEyebrow: "MEAL PLANS",
  subscriptionsPageTitle: "Fresh meals, on your schedule.",
  subscriptionsPageDescription: "Choose the days and meal time that suit you. Requests are confirmed by the kitchen before a plan begins.",
  subscriptionTitle: "Choose your plan",
  weekly: "Weekly",
  monthly: "Monthly",
  subscriptionBillingCycle: "Billing cycle",
  subscriptionMeal: "Meal",
  subscriptionStartDate: "Start date",
  subscriptionEndDate: "End date (optional)",
  subscriptionDays: "Delivery days",
  subscriptionSaving: "Saving…",
  subscriptionSubmit: "Request meal plan",
  subscriptionSuccess: "Your meal plan request is saved. The kitchen will confirm availability with you.",
  subscriptionSignInReason: "Sign in to save your meal subscription.",
  subscriptionSignInRequired: "Sign in with a verified account to subscribe.",
  recentlyViewed: "Recently viewed",
  menuUnavailableTitle: "Menu temporarily unavailable",
  menuUnavailableDescription: "We couldn’t load the menu right now. Please try again in a moment.",
  tryAgain: "Try again",
  helpEyebrow: "HELP CENTER",
  helpTitle: "Frequently asked questions",
  faqOrderQuestion: "How do I place an order?",
  faqOrderAnswer: "Choose dishes from the menu, customize your portions, and submit your delivery details at checkout. The kitchen confirms the request before preparing it.",
  faqDeliveryQuestion: "Which areas do you deliver to?",
  faqDeliveryAnswer: "Current delivery zones and fees are shown at checkout. If your neighborhood is not listed, contact the team before ordering.",
  faqPaymentQuestion: "How can I pay?",
  faqPaymentAnswer: "Cash on delivery and the Raast payment option are available where enabled. A payment receipt is reviewed by the team before an order is marked paid.",
  faqTrackingQuestion: "How do I track an order?",
  faqTrackingAnswer: "Use the order number and phone number from checkout on the Track Order page. Status updates appear as the order moves through the kitchen and delivery.",
  faqChangesQuestion: "Can I change or cancel an order?",
  faqChangesAnswer: "Contact the kitchen as soon as possible. Changes depend on whether preparation has started.",
  faqPlansQuestion: "How do subscriptions and reservations work?",
  faqPlansAnswer: "Submit a meal plan or table request through the relevant form. Requests are pending until the team confirms availability.",
});
Object.assign(translations.ur, {
  reservationEyebrow: "میز کی بکنگ",
  reservationPageTitle: "گھر کے کھانے کے ساتھ محفل سجائیں۔",
  reservationPageDescription: "اپنے گروپ کے لیے بکنگ کی درخواست بھیجیں۔ ہم فون پر وقت کی تصدیق کریں گے۔",
  reservationTitle: "میز کی درخواست کریں",
  reservationName: "آپ کا نام",
  reservationPhone: "فون",
  reservationGuests: "مہمان",
  reservationDateTime: "تاریخ اور وقت",
  reservationNotes: "نوٹس",
  reservationNotesPlaceholder: "رسائی کی ضرورت یا خصوصی درخواست (اختیاری)",
  reservationSaving: "درخواست بھیجی جا رہی ہے…",
  reservationSubmit: "بکنگ کی درخواست",
  reservationSuccess: "بکنگ کی درخواست بھیج دی گئی۔ ہم فون پر تصدیق کریں گے۔",
  subscriptionsEyebrow: "کھانے کے منصوبے",
  subscriptionsPageTitle: "تازہ کھانا، آپ کے وقت کے مطابق۔",
  subscriptionsPageDescription: "اپنے دن اور کھانے کا وقت منتخب کریں۔ منصوبہ شروع ہونے سے پہلے باورچی خانہ دستیابی کی تصدیق کرے گا۔",
  subscriptionTitle: "اپنا منصوبہ منتخب کریں",
  weekly: "ہفتہ وار",
  monthly: "ماہانہ",
  subscriptionBillingCycle: "ادائیگی کا دورانیہ",
  subscriptionMeal: "کھانا",
  subscriptionStartDate: "شروع ہونے کی تاریخ",
  subscriptionEndDate: "آخری تاریخ (اختیاری)",
  subscriptionDays: "ترسیل کے دن",
  subscriptionSaving: "محفوظ ہو رہا ہے…",
  subscriptionSubmit: "کھانے کے منصوبے کی درخواست",
  subscriptionSuccess: "آپ کی درخواست محفوظ ہو گئی۔ باورچی خانہ دستیابی کی تصدیق کرے گا۔",
  subscriptionSignInReason: "کھانے کا منصوبہ محفوظ کرنے کے لیے سائن اِن کریں۔",
  subscriptionSignInRequired: "سبسکرپشن کے لیے تصدیق شدہ اکاؤنٹ سے سائن اِن کریں۔",
  recentlyViewed: "حال ہی میں دیکھے گئے",
  menuUnavailableTitle: "مینو عارضی طور پر دستیاب نہیں",
  menuUnavailableDescription: "ابھی مینو لوڈ نہیں ہو سکا۔ براہِ کرم تھوڑی دیر بعد کوشش کریں۔",
  tryAgain: "دوبارہ کوشش کریں",
  helpEyebrow: "مدد کا مرکز",
  helpTitle: "اکثر پوچھے جانے والے سوالات",
  faqOrderQuestion: "آرڈر کیسے دیا جاتا ہے؟",
  faqOrderAnswer: "مینو سے کھانے منتخب کریں، مقدار اپنی پسند کے مطابق بنائیں، اور چیک آؤٹ پر ترسیل کی تفصیل بھیجیں۔ کھانا تیار کرنے سے پہلے باورچی خانہ درخواست کی تصدیق کرے گا۔",
  faqDeliveryQuestion: "آپ کن علاقوں میں ترسیل کرتے ہیں؟",
  faqDeliveryAnswer: "موجودہ ترسیلی علاقوں اور فیس کی تفصیل چیک آؤٹ پر دکھائی جاتی ہے۔ اگر آپ کا علاقہ فہرست میں نہیں تو آرڈر سے پہلے ٹیم سے رابطہ کریں۔",
  faqPaymentQuestion: "ادائیگی کیسے کی جا سکتی ہے؟",
  faqPaymentAnswer: "جہاں دستیاب ہو، کیش آن ڈیلیوری اور راست ادائیگی کے اختیارات موجود ہیں۔ آرڈر کو ادا شدہ قرار دینے سے پہلے ٹیم رسید کا جائزہ لیتی ہے۔",
  faqTrackingQuestion: "آرڈر کی صورتحال کیسے دیکھیں؟",
  faqTrackingAnswer: "ٹریک آرڈر صفحے پر چیک آؤٹ سے ملا آرڈر نمبر اور فون نمبر درج کریں۔ باورچی خانے اور ترسیل کے مراحل کے ساتھ صورتحال تازہ ہوتی رہے گی۔",
  faqChangesQuestion: "کیا آرڈر تبدیل یا منسوخ کیا جا سکتا ہے؟",
  faqChangesAnswer: "جلد از جلد باورچی خانے سے رابطہ کریں۔ تبدیلی کا امکان اس بات پر منحصر ہے کہ کھانا تیار ہونا شروع ہوا ہے یا نہیں۔",
  faqPlansQuestion: "سبسکرپشن اور بکنگ کیسے کام کرتی ہیں؟",
  faqPlansAnswer: "متعلقہ فارم کے ذریعے کھانے کے منصوبے یا میز کی درخواست بھیجیں۔ ٹیم کی تصدیق تک درخواست زیرِ التوا رہے گی۔",
});
for (const locale of Object.keys(translations) as Locale[]) {
  Object.assign(translations[locale], {
    monday: locale === "ur" ? "پیر" : "Monday",
    tuesday: locale === "ur" ? "منگل" : "Tuesday",
    wednesday: locale === "ur" ? "بدھ" : "Wednesday",
    thursday: locale === "ur" ? "جمعرات" : "Thursday",
    friday: locale === "ur" ? "جمعہ" : "Friday",
    saturday: locale === "ur" ? "ہفتہ" : "Saturday",
    sunday: locale === "ur" ? "اتوار" : "Sunday",
  });
}

const paymentTranslations: Record<Locale, Record<string, string>> = {
  en: { codChoice: "Cash on Delivery", codChoiceDescription: "Pay cash when your order arrives.", raastChoice: "MCB Raast QR", raastChoiceDescription: "Scan the static merchant QR and enter the exact amount manually.", whatsappChoice: "Confirm on WhatsApp", whatsappChoiceDescription: "Discuss payment with our team.", submittingOrder: "Submitting order…", raastPreparing: "Preparing payment instructions", raastTitle: "Pay with MCB Raast", raastPending: "Awaiting verification", raastOrder: "Order reference", raastTimeLeft: "Payment instruction window", raastExpired: "Checkout window expired", raastExpiredDescription: "The QR has been hidden. Request fresh instructions before paying; this merchant QR itself is static and reusable.", raastAccountName: "Account name", raastAccountRef: "Account ref", raastAmount: "Exact payable amount", raastStaticWarningTitle: "Static QR · amount is not embedded", raastStaticWarning: "This MCB QR does not prefill the amount or enforce a five-minute expiry. Before paying, confirm the recipient is MUMTAZ ALI (ref ending 9955) and enter the exact amount shown above.", raastVerificationNote: "This checkout has no MCB payment API or bank callback. Your order remains pending until the merchant verifies the transaction in their MCB account.", raastNotifyButton: "Notify merchant on WhatsApp", raastNoPaid: "Sending a message does not confirm payment. Do not treat this order as paid until MCB verifies the transaction." },
  ur: { codChoice: "کیش آن ڈیلیوری", codChoiceDescription: "آرڈر پہنچنے پر نقد ادائیگی کریں۔", raastChoice: "ایم سی بی راست کیو آر", raastChoiceDescription: "مرچنٹ کا جامد کیو آر اسکین کریں اور رقم خود درج کریں۔", whatsappChoice: "واٹس ایپ پر تصدیق", whatsappChoiceDescription: "ادائیگی کے لیے ہماری ٹیم سے بات کریں۔", submittingOrder: "آرڈر بھیجا جا رہا ہے…", raastPreparing: "ادائیگی کی ہدایات تیار ہو رہی ہیں", raastTitle: "ایم سی بی راست سے ادائیگی", raastPending: "تصدیق کا انتظار", raastOrder: "آرڈر حوالہ", raastTimeLeft: "ادائیگی کی ہدایات کا وقت", raastExpired: "چیک آؤٹ کا وقت ختم", raastExpiredDescription: "کیو آر چھپا دیا گیا ہے۔ ادائیگی سے پہلے نئی ہدایات لیں؛ یہ مرچنٹ کیو آر جامد اور دوبارہ استعمال کے قابل ہے۔", raastAccountName: "اکاؤنٹ کا نام", raastAccountRef: "اکاؤنٹ حوالہ", raastAmount: "بالکل قابل ادائیگی رقم", raastStaticWarningTitle: "جامد کیو آر · رقم شامل نہیں", raastStaticWarning: "یہ ایم سی بی کیو آر رقم خود نہیں بھرتا اور پانچ منٹ بعد بینک کی طرف سے بند نہیں ہوتا۔ ادائیگی سے پہلے وصول کنندہ MUMTAZ ALI (حوالہ 9955 پر ختم) کی تصدیق کریں اور اوپر دی گئی رقم درج کریں۔", raastVerificationNote: "اس چیک آؤٹ میں ایم سی بی ادائیگی اے پی آئی یا بینک کال بیک موجود نہیں۔ مرچنٹ کے ایم سی بی اکاؤنٹ میں تصدیق ہونے تک آرڈر زیرِ التوا رہے گا۔", raastNotifyButton: "واٹس ایپ پر مرچنٹ کو اطلاع دیں", raastNoPaid: "پیغام بھیجنے سے ادائیگی کی تصدیق نہیں ہوتی۔ ایم سی بی کی تصدیق تک آرڈر کو ادا شدہ نہ سمجھیں۔" },
  sd: { codChoice: "ڪيش آن ڊليوري", codChoiceDescription: "آرڊر پهچڻ تي نقد ادا ڪريو.", raastChoice: "ايم سي بي راست ڪيو آر", raastChoiceDescription: "مرچنٽ جو جامد ڪيو آر اسڪين ڪري رقم پاڻ لکو.", whatsappChoice: "واٽس ايپ تي تصديق", whatsappChoiceDescription: "ادائيگي لاءِ اسان جي ٽيم سان ڳالهايو.", submittingOrder: "آرڊر موڪليو پيو وڃي…", raastPreparing: "ادائيگي جون هدايتون تيار ٿي رهيون آهن", raastTitle: "ايم سي بي راست سان ادا ڪريو", raastPending: "تصديق جو انتظار", raastOrder: "آرڊر حوالو", raastTimeLeft: "ادائيگي جي هدايتن جو وقت", raastExpired: "چيڪ آئوٽ جو وقت ختم", raastExpiredDescription: "ڪيو آر لڪايو ويو آهي. ادا ڪرڻ کان اڳ نيون هدايتون وٺو؛ هي مرچنٽ ڪيو آر جامد ۽ ٻيهر استعمال لائق آهي.", raastAccountName: "اڪائونٽ جو نالو", raastAccountRef: "اڪائونٽ حوالو", raastAmount: "بلڪل ادا ڪرڻي رقم", raastStaticWarningTitle: "جامد ڪيو آر · رقم شامل ناهي", raastStaticWarning: "هي ايم سي بي ڪيو آر رقم پاڻ نٿو ڀري ۽ پنجن منٽن کان پوءِ بئنڪ طرفان بند نٿو ٿئي. ادا ڪرڻ کان اڳ وصول ڪندڙ MUMTAZ ALI (حوالو 9955 تي ختم) جي تصديق ڪريو ۽ مٿي واري رقم لکو.", raastVerificationNote: "هن چيڪ آئوٽ ۾ ايم سي بي ادائيگي اي پي آءِ يا بئنڪ ڪال بيڪ ناهي. مرچنٽ جي ايم سي بي اڪائونٽ ۾ تصديق ٿيڻ تائين آرڊر انتظار ۾ رهندو.", raastNotifyButton: "واٽس ايپ تي مرچنٽ کي اطلاع ڏيو", raastNoPaid: "پيغام موڪلڻ سان ادائيگي جي تصديق نٿي ٿئي. ايم سي بي جي تصديق کان اڳ آرڊر کي ادا ٿيل نه سمجهو." },
  "ur-Latn": { codChoice: "Cash on Delivery", codChoiceDescription: "Order anay par cash dein.", raastChoice: "MCB Raast QR", raastChoiceDescription: "Static merchant QR scan karein aur exact raqam khud likhein.", whatsappChoice: "WhatsApp par confirm", whatsappChoiceDescription: "Payment ke liye hamari team se baat karein.", submittingOrder: "Order bheja ja raha hai…", raastPreparing: "Payment hidayat tayyar ho rahi hai", raastTitle: "MCB Raast se payment", raastPending: "Tasdeeq ka intezar", raastOrder: "Order reference", raastTimeLeft: "Payment hidayat ka waqt", raastExpired: "Checkout ka waqt khatam", raastExpiredDescription: "QR chhupa diya gaya hai. Payment se pehle nayi hidayat lein; yeh merchant QR static aur dobara istemal ho sakta hai.", raastAccountName: "Account name", raastAccountRef: "Account reference", raastAmount: "Bilkul adaigi ki raqam", raastStaticWarningTitle: "Static QR · raqam shamil nahin", raastStaticWarning: "Yeh MCB QR raqam khud nahin bharta aur bank taraf se paanch minute baad band nahin hota. Payment se pehle MUMTAZ ALI (reference 9955 par khatam) tasdeeq karein aur upar wali exact raqam likhein.", raastVerificationNote: "Is checkout mein MCB payment API ya bank callback maujood nahin. Merchant ke MCB account mein tasdeeq tak order pending rahega.", raastNotifyButton: "WhatsApp par merchant ko batayein", raastNoPaid: "Message bhejna payment ki tasdeeq nahin hai. MCB ki tasdeeq se pehle order ko paid na samjhein." },
};
for (const locale of Object.keys(paymentTranslations) as Locale[]) Object.assign(translations[locale], paymentTranslations[locale]);

type SettingsValue = { locale: Locale; theme: Theme; setLocale: (locale: Locale) => void; setTheme: (theme: Theme) => void; t: (key: string) => string; localeNames: Record<Locale, string>; themeNames: Record<Theme, string> };
const SettingsContext = createContext<SettingsValue | null>(null);

export function SiteSettingsProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");
  const [theme, setThemeState] = useState<Theme>("light");
  useEffect(() => {
    try {
      const savedLocale = localStorage.getItem("hmf_locale") as Locale | null;
      const savedTheme = localStorage.getItem("hmf_theme") as Theme | null;
      // Restore browser preferences only after hydration so server and client render the same initial markup.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (savedLocale && savedLocale in localeNames) setLocaleState(savedLocale);
      if (savedTheme && savedTheme in themeNames) setThemeState(savedTheme);
    } catch { /* Preferences remain usable when storage is unavailable. */ }
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = rtlLocales.has(locale) ? "rtl" : "ltr";
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("hmf_locale", locale); localStorage.setItem("hmf_theme", theme); } catch { /* Storage is optional. */ }
  }, [locale, theme]);
  const value = useMemo<SettingsValue>(() => ({ locale, theme, setLocale: setLocaleState, setTheme: setThemeState, t: (key) => translations[locale][key] ?? translations.en[key] ?? key, localeNames, themeNames }), [locale, theme]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSiteSettings() {
  const value = useContext(SettingsContext);
  if (!value) throw new Error("useSiteSettings must be used inside SiteSettingsProvider.");
  return value;
}
