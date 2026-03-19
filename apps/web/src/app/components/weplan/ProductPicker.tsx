"use client";

import { useState, useEffect } from "react";
import { getPartnersForTenant, getProductsForPartner } from "@/app/actions/contracts";
import type { ProductOption } from "@/app/actions/contracts";
import { segmentLabel } from "@/app/lib/segment-labels";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
import { Building, Package } from "lucide-react";

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

  const filteredPartners = partners.filter((p) => !segment || p.segment === segment);
  const partnerOptions = filteredPartners.filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i);

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
        <CustomDropdown
          value={value.partnerId}
          onChange={handlePartnerChange}
          options={[
            { id: "", label: "— vyberte" },
            ...partnerOptions.map((p) => ({
              id: p.id,
              label: `${p.name}${p.segment ? ` (${segmentLabel(p.segment)})` : ""}`.trim(),
            })),
          ]}
          placeholder="— vyberte"
          icon={Building}
        />
        {!loadingPartners && segment && partnerOptions.length === 0 && (
          <p className="text-[11px] text-slate-500 mt-1">Pro tento segment zatím nejsou partneři v katalogu. Můžete vyplnit název partnera a produktu ručně níže.</p>
        )}
      </div>
      {value.partnerId && (
        <div>
          <label className="block text-monday-text-muted text-[11px] font-medium mb-1">Produkt</label>
          <CustomDropdown
            value={value.productId}
            onChange={handleProductChange}
            options={[
              { id: "", label: "— vyberte" },
              ...(categories.length > 0
                ? categories.flatMap((cat) =>
                    byCategory[cat].map((p) => ({
                      id: p.id,
                      label: (categories.length > 1 ? `${cat || "—"}: ` : "") + p.name + (p.isTbd ? " • doplnit" : ""),
                    }))
                  )
                : products.map((p) => ({ id: p.id, label: p.name + (p.isTbd ? " • doplnit" : "") }))),
            ]}
            placeholder={loadingProducts ? "Načítám…" : "— vyberte"}
            icon={Package}
          />
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
