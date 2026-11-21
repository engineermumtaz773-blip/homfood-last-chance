"use client";

import Link from "next/link";
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useSiteSettings } from "@/components/site-settings";
import { getSiteUrl } from "@/lib/seo";

export function DishQrLink({ dishId, dishName }: { dishId: number; dishName: string }) {
  const { t } = useSiteSettings();
  const [open, setOpen] = useState(false);
  const path = `/dish/${dishId}`;
  const url = new URL(path, getSiteUrl()).toString();

  return (
    <div className="dish-share-tools" onClick={(event) => event.stopPropagation()}>
      <Link href={path} aria-label={`${t("dishDetails")}: ${dishName}`}>{t("dishDetails")}</Link>
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{t("dishQr")}</button>
      {open && (
        <div className="dish-card-qr">
          <Link href={path} aria-label={`${t("dishDetails")}: ${dishName}`}>
            <QRCodeSVG value={url} size={104} level="M" includeMargin />
          </Link>
          <span>{t("scanDishQr")}</span>
        </div>
      )}
    </div>
  );
}
