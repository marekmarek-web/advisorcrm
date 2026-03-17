"use client";

import { useRef, useEffect, useId, useState } from "react";
import { wizardInputWithIconClass } from "@/app/components/wizard/wizard-styles";

declare global {
  interface Window {
    __googleMapsLoaded?: boolean;
    google?: {
      maps: {
        places: {
          Autocomplete: new (
            input: HTMLInputElement,
            opts?: { types?: string[]; fields?: string[] }
          ) => {
            getPlace: () => {
              address_components?: Array<{ types?: string[]; long_name: string; short_name?: string }>;
            };
            addListener: (event: string, fn: () => void) => void;
          };
        };
      };
    };
  }
}

export type AddressComponents = {
  street?: string;
  houseNumber?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  region?: string;
};

const SCRIPT_ID = "google-maps-places-script";

function loadGoogleMapsScript(apiKey: string): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("No window"));
  const existing = document.getElementById(SCRIPT_ID);
  if (existing && (window as unknown as { __googleMapsLoaded?: boolean }).__googleMapsLoaded) {
    return Promise.resolve();
  }
  if (existing) {
    return new Promise((resolve, reject) => {
      (existing as HTMLScriptElement).addEventListener("load", () => resolve());
      (existing as HTMLScriptElement).addEventListener("error", () => reject(new Error("Script load failed")));
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      (window as unknown as { __googleMapsLoaded?: boolean }).__googleMapsLoaded = true;
      resolve();
    };
    script.onerror = () => reject(new Error("Google Maps script failed to load"));
    document.head.appendChild(script);
  });
}

function parseAddressComponents(place: { address_components?: Array<{ types?: string[]; long_name: string; short_name?: string }> }): AddressComponents {
  const comp: AddressComponents = {};
  const ac = place.address_components || [];
  for (const c of ac) {
    const types = c.types || [];
    if (types.includes("street_number")) comp.houseNumber = c.long_name;
    if (types.includes("route")) comp.street = c.long_name;
    if (types.includes("locality")) comp.city = c.long_name;
    if (types.includes("postal_code")) comp.postalCode = c.long_name;
    if (types.includes("country")) comp.country = c.short_name || c.long_name;
    if (types.includes("administrative_area_level_1")) comp.region = c.long_name;
  }
  if (!comp.city && ac.some((c) => c.types?.includes("sublocality_level_1"))) {
    const sub = ac.find((c) => c.types?.includes("sublocality_level_1"));
    if (sub) comp.city = sub.long_name;
  }
  if (!comp.city && ac.some((c) => c.types?.includes("postal_town"))) {
    const town = ac.find((c) => c.types?.includes("postal_town"));
    if (town) comp.city = town.long_name;
  }
  return comp;
}

export function AddressAutocomplete({
  value,
  onChange,
  onSelectAddress,
  placeholder = "Začněte psát adresu…",
  className = "",
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  onSelectAddress: (components: AddressComponents) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<unknown>(null);
  const [ready, setReady] = useState(false);
  const id = useId();
  const apiKey =
    typeof process !== "undefined" && process.env?.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    process.env?.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY?.trim() ||
    "";

  useEffect(() => {
    if (!apiKey || !inputRef.current) {
      setReady(false);
      return;
    }
    let cancelled = false;
    loadGoogleMapsScript(apiKey)
      .then(() => {
        if (cancelled || !inputRef.current || !window.google) return;
        if (autocompleteRef.current) autocompleteRef.current = null;
        const g = window.google;
        if (!g?.maps?.places?.Autocomplete) return;
        const autocomplete = new g.maps.places.Autocomplete(inputRef.current, {
          types: ["address"],
          fields: ["address_components"],
        });
        autocomplete.addListener("place_changed", () => {
          const place = autocomplete.getPlace();
          if (!place?.address_components?.length) return;
          const components = parseAddressComponents(place);
          onSelectAddress(components);
          const streetPart = [components.street, components.houseNumber].filter(Boolean).join(" ");
          if (streetPart) onChange(streetPart);
        });
        autocompleteRef.current = autocomplete;
        setReady(true);
      })
      .catch(() => setReady(false));
    return () => {
      cancelled = true;
      autocompleteRef.current = null;
    };
  }, [apiKey, onSelectAddress, onChange]);

  return (
    <input
      ref={inputRef}
      id={id}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={ready ? placeholder : "Adresa (bez klíče Google se doplňuje ručně)"}
      className={`${wizardInputWithIconClass} ${className}`.trim()}
      disabled={disabled}
      autoComplete="off"
      aria-describedby={ready ? undefined : "address-no-api"}
    />
  );
}
