"use client";

import { useRef, useEffect, useId, useState } from "react";
import { wizardInputWithIconClass } from "@/app/components/wizard/wizard-styles";

declare global {
  interface Window {
    __googleMapsLoaded?: boolean;
    gm_authFailure?: () => void;
    google?: {
      maps: {
        event: { clearInstanceListeners: (instance: unknown) => void };
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
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&loading=async`;
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
  const onSelectAddressRef = useRef(onSelectAddress);
  const onChangeRef = useRef(onChange);
  onSelectAddressRef.current = onSelectAddress;
  onChangeRef.current = onChange;

  const [ready, setReady] = useState(false);
  const [apiBlocked, setApiBlocked] = useState(false);
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

    const prevGmAuthFailure = window.gm_authFailure;
    window.gm_authFailure = () => {
      setApiBlocked(true);
      setReady(false);
      prevGmAuthFailure?.();
    };

    let cancelled = false;
    loadGoogleMapsScript(apiKey)
      .then(() => {
        if (cancelled || !inputRef.current || !window.google) return;
        const g = window.google;
        if (!g?.maps?.places?.Autocomplete) return;

        const acPrev = autocompleteRef.current;
        if (acPrev && g.maps.event?.clearInstanceListeners) {
          g.maps.event.clearInstanceListeners(acPrev);
        }
        autocompleteRef.current = null;

        const autocomplete = new g.maps.places.Autocomplete(inputRef.current, {
          types: ["address"],
          fields: ["address_components"],
        });
        autocomplete.addListener("place_changed", () => {
          const place = autocomplete.getPlace();
          if (!place?.address_components?.length) return;
          const components = parseAddressComponents(place);
          onSelectAddressRef.current(components);
          const streetPart = [components.street, components.houseNumber].filter(Boolean).join(" ");
          if (streetPart) onChangeRef.current(streetPart);
        });
        autocompleteRef.current = autocomplete;
        setReady(true);
        setApiBlocked(false);
      })
      .catch(() => {
        setReady(false);
      });

    return () => {
      cancelled = true;
      window.gm_authFailure = prevGmAuthFailure;
      const ac = autocompleteRef.current;
      autocompleteRef.current = null;
      if (ac && window.google?.maps?.event?.clearInstanceListeners) {
        window.google.maps.event.clearInstanceListeners(ac);
      }
    };
  }, [apiKey]);

  const noApi = !apiKey;
  const showManualHint = noApi || apiBlocked;
  const effectivePlaceholder = showManualHint
    ? apiBlocked
      ? "Google Maps na této doméně blokuje klíč — doplňte adresu ručně (API restrictions v Google Cloud)."
      : "Adresa (bez klíče Google se doplňuje ručně)"
    : placeholder;

  return (
    <>
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={effectivePlaceholder}
        className={`${wizardInputWithIconClass} ${className}`.trim()}
        disabled={disabled}
        autoComplete="off"
        aria-describedby={showManualHint ? "address-no-api" : undefined}
      />
      <span id="address-no-api" className="sr-only">
        {apiBlocked
          ? "Doplňování adresy z Google na této doméně nefunguje kvůli omezení API klíče. Vyplňte údaje ručně níže."
          : "Bez nastaveného klíče zadejte adresu ručně do polí níže."}
      </span>
    </>
  );
}
