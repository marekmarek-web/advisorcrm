"use client";

import { useState, useEffect } from "react";
import { getPartnersForTenant, getProductsForPartner } from "@/app/actions/contracts";
import type { ProductOption } from "@/app/actions/contracts";
import { segmentLabel } from "@/app/lib/segment-labels";

export type ProductPickerValue = {
  partnerId: string;
  productId: string;
  partnerName?: string;
  productName?: string;
};

interface ProductPickerProps {
  segment?: string;
  value: ProductPickerValue;
  onChange: (value: ProductPickerValue) => void;
  onActivityLog?: (message: string, meta?: { partnerName?: string; productName?: string }) => void;
  className?: string;
}

export function ProductPicker({
  segment,
  value,
  onChange,
  onActivityLog,
  className = "",
}: ProductPickerProps) {
  const [partners, setPartners] = useState<{ id: string; name: string; segment: string }[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loadingPartners, setLoadingPartners] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);

  useEffect(() => {
    getPartnersForTenant()
      .then(setPartners)
      .catch(() => setPartners([]))
      .finally(() => setLoadingPartners(false));
  }, []);

  useEffect(() => {
    if (!value.partnerId) {
      setProducts([]);
      return;
    }
    setLoadingProducts(true);
    getProductsForPartner(value.partnerId)
      .then(setProducts)
      .catch(() => setProducts([]))
      .finally(() => setLoadingProducts(false));
  }, [value.partnerId]);

  const handlePartnerChange = (partnerId: string) => {
    const partner = partners.find((p) => p.id === partnerId);
    onChange({
      partnerId,
      productId: "",
      partnerName: partner?.name,
      productName: undefined,
    });
  };

  const handleProductChange = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    const partner = partners.find((p) => p.id === value.partnerId);
    onChange({
      ...value,
      productId,
      productName: product?.name,
      partnerName: partner?.name ?? value.partnerName,
    });
    if (onActivityLog && product) {
      onActivityLog("product_change", {
        partnerName: partner?.name,
        productName: product.name,
      });
    }
  };

  const byCategory = products.reduce<Record<string, ProductOption[]>>((acc, p) => {
    const cat = p.category || "";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {});
  const categories = Object.keys(byCategory).sort();

  return (
    <div className={`space-y-2 text-[13px] ${className}`}>
      {segment != null && (
        <div>
          <label className="block text-monday-text-muted text-[11px] font-medium mb-1">Segment</label>
          <span className="text-monday-text">{segmentLabel(segment)}</span>
        </div>
      )}
      <div>
        <label className="block text-monday-text-muted text-[11px] font-medium mb-1">Partner</label>
        <select
          value={value.partnerId}
          onChange={(e) => handlePartnerChange(e.target.value)}
          disabled={loadingPartners}
          className="w-full rounded-[6px] border border-monday-border px-2 py-1.5 text-monday-text bg-monday-surface focus:outline-none focus:ring-1 focus:ring-monday-blue"
        >
          <option value="">— vyberte</option>
          {partners
            .filter((p) => !segment || p.segment === segment)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.segment ? `(${segmentLabel(p.segment)})` : ""}
              </option>
            ))}
        </select>
      </div>
      {value.partnerId && (
        <div>
          <label className="block text-monday-text-muted text-[11px] font-medium mb-1">Produkt</label>
          <select
            value={value.productId}
            onChange={(e) => handleProductChange(e.target.value)}
            disabled={loadingProducts}
            className="w-full rounded-[6px] border border-monday-border px-2 py-1.5 text-monday-text bg-monday-surface focus:outline-none focus:ring-1 focus:ring-monday-blue"
          >
            <option value="">— vyberte</option>
            {categories.length > 0
              ? categories.map((cat) => (
                  <optgroup key={cat || "_"} label={cat || "—"}>
                    {byCategory[cat].map((p) => (
                      <option key={p.id} value={p.id} title={p.isTbd ? "Doplnit údaje" : undefined}>
                        {p.name}
                        {p.isTbd ? " • doplnit" : ""}
                      </option>
                    ))}
                  </optgroup>
                ))
              : products.map((p) => (
                  <option key={p.id} value={p.id} title={p.isTbd ? "Doplnit údaje" : undefined}>
                    {p.name}
                    {p.isTbd ? " • doplnit" : ""}
                  </option>
                ))}
          </select>
          {products.some((p) => p.id === value.productId && p.isTbd) && (
            <span
              className="inline-block mt-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-amber-100 text-amber-800"
              title="Doplnit údaje"
            >
              doplnit
            </span>
          )}
        </div>
      )}
    </div>
  );
}
