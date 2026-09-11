"use client";

import { useState } from "react";
import { Map as MapIcon, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectLocationMap } from "./ProjectLocationMapLazy";
import type { ReverseGeocodedAddress } from "@/lib/mapbox";

/** Mapa (Mapbox GL, reálné dlaždice ze sítě) se nemá načítat na každém otevření projektu —
 * schovaná za tlačítkem, dokud si ji uživatel sám nevyžádá. */
export function LocationMapToggle(props: {
  projectId: string;
  initialLat: number | null;
  initialLng: number | null;
  currentAddress: {
    street: string | null;
    houseNumber: string | null;
    city: string | null;
    zip: string | null;
    country: string | null;
  };
  onSetGps: (projectId: string, lat: number, lng: number) => Promise<void>;
  onSetAddress: (projectId: string, address: ReverseGeocodedAddress) => Promise<void>;
}) {
  const [shown, setShown] = useState(false);

  if (!shown) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setShown(true)}>
        <MapIcon className="size-4" />
        Načíst z mapy
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="ghost" size="sm" onClick={() => setShown(false)}>
        <ChevronUp className="size-4" />
        Skrýt mapu
      </Button>
      <ProjectLocationMap {...props} />
    </div>
  );
}
