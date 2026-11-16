"use client";

import { useEffect } from "react";
import { loadCustomerOrders, loadCustomerProfile } from "@/lib/customer";

export function CustomerSessionRuntime() {
  useEffect(() => {
    let active = true;
    void loadCustomerProfile()
      .then((profile) => profile ? loadCustomerOrders() : [])
      .catch((error: unknown) => {
        if (active) console.error("Could not initialize the customer session from Supabase.", error);
      });
    return () => { active = false; };
  }, []);

  return null;
}
