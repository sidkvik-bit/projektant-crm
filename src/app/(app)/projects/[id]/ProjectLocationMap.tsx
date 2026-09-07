"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MapPin, Navigation, AlertCircle, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxInputGroup,
  ComboboxInput,
  ComboboxIcon,
  ComboboxContent,
  ComboboxItem,
} from "@/components/ui/combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { reverseGeocode, searchPlaces, type PlaceSuggestion, type ReverseGeocodedAddress } from "@/lib/mapbox";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

// Bez zadaného bodu se mapa vycentruje na ČR (celá republika ve výřezu).
const CZECHIA_CENTER: [number, number] = [15.473, 49.8175];
const DEFAULT_ZOOM = 7;
const POINT_ZOOM = 15;

// Projektant často potřebuje víc než jen ulice — satelitní snímek pro reálný stav pozemku,
// terénní podklad s vrstevnicemi pro sklon/výškové poměry.
const MAP_STYLES = {
  streets: { label: "Ulice", url: "mapbox://styles/mapbox/streets-v12" },
  satellite: { label: "Satelit", url: "mapbox://styles/mapbox/satellite-streets-v12" },
  outdoors: { label: "Terén", url: "mapbox://styles/mapbox/outdoors-v12" },
} as const;
type MapStyleKey = keyof typeof MAP_STYLES;

interface Point {
  lat: number;
  lng: number;
}

/**
 * Interaktivní mapa na detailu projektu — klik/tažení pinu vybere bod, a teprve pak (ne
 * automaticky) se zeptá, jestli tím "Přepsat GPS" (uloží přímo souřadnice) nebo "Přepsat
 * adresu" (reverse geocoding bodu -> adresní pole). Nezávislé akce, obě volitelné.
 */
export function ProjectLocationMap({
  projectId,
  initialLat,
  initialLng,
  currentAddress,
  onSetGps,
  onSetAddress,
}: {
  projectId: string;
  initialLat: number | null;
  initialLng: number | null;
  currentAddress: { street: string | null; houseNumber: string | null; city: string | null; zip: string | null; country: string | null };
  onSetGps: (projectId: string, lat: number, lng: number) => Promise<void>;
  onSetAddress: (projectId: string, address: ReverseGeocodedAddress) => Promise<void>;
}) {
  const router = useRouter();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);

  const applied: Point | null = initialLat != null && initialLng != null ? { lat: initialLat, lng: initialLng } : null;
  const [pending, setPending] = useState<Point | null>(null);
  const [savingGps, setSavingGps] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [confirmGps, setConfirmGps] = useState<Point | null>(null);
  const [confirmAddress, setConfirmAddress] = useState<{ point: Point; address: ReverseGeocodedAddress } | null>(null);
  const [lookingUpAddress, setLookingUpAddress] = useState(false);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [mapStyle, setMapStyle] = useState<MapStyleKey>("streets");
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstStyleRender = useRef(true);

  // Sdílené mezi kliknutím na mapu (bez posunu/zoomu — bod je už vidět) a textovým
  // vyhledáním (kde se má mapa přesunout na nalezené místo).
  function placeMarker(point: Point, { fly = false }: { fly?: boolean } = {}) {
    const map = mapRef.current;
    if (!map) return;
    if (markerRef.current) {
      markerRef.current.setLngLat([point.lng, point.lat]);
    } else {
      const marker = new mapboxgl.Marker({ draggable: true }).setLngLat([point.lng, point.lat]).addTo(map);
      marker.on("dragend", () => {
        const lngLat = marker.getLngLat();
        setPending({ lat: lngLat.lat, lng: lngLat.lng });
      });
      markerRef.current = marker;
    }
    if (fly) map.flyTo({ center: [point.lng, point.lat], zoom: POINT_ZOOM });
    setPending(point);
  }

  function handleSearchInputChange(query: string) {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (query.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    searchTimeoutRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        setSuggestions(await searchPlaces(query));
      } finally {
        setSearching(false);
      }
    }, 300);
  }

  function handleSearchSelect(place: PlaceSuggestion | null) {
    if (!place) return;
    placeMarker({ lat: place.lat, lng: place.lng }, { fly: true });
    setSuggestions([]);
  }

  // Nová data ze serveru (po uložení) — zahodí rozpracovaný výběr, tlačítka zmizí.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPending(null);
    setAddressError(null);
  }, [initialLat, initialLng]);

  useEffect(() => {
    if (!MAPBOX_TOKEN || !mapContainerRef.current || mapRef.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;
    const center = applied ? ([applied.lng, applied.lat] as [number, number]) : CZECHIA_CENTER;
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLES[mapStyle].url,
      center,
      zoom: applied ? POINT_ZOOM : DEFAULT_ZOOM,
    });
    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    mapRef.current = map;

    if (applied) placeMarker(applied);

    map.on("click", (e) => {
      placeMarker({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Mapa se mountuje jednou — přesuny pinu jdou přes marker.setLngLat, ne remount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Přepnutí podkladu jde přes setStyle (marker/kontroly na mapě nejsou součástí stylu,
  // po přepnutí zůstávají) — bez týhle podmínky by první render zbytečně nahrál styl znovu.
  useEffect(() => {
    if (isFirstStyleRender.current) {
      isFirstStyleRender.current = false;
      return;
    }
    mapRef.current?.setStyle(MAP_STYLES[mapStyle].url);
  }, [mapStyle]);

  async function handleLookupAddress() {
    if (!pending) return;
    setLookingUpAddress(true);
    setAddressError(null);
    try {
      const address = await reverseGeocode(pending.lat, pending.lng);
      if (!address) {
        setAddressError("Adresu se pro tenhle bod nepodařilo najít.");
        return;
      }
      setConfirmAddress({ point: pending, address });
    } finally {
      setLookingUpAddress(false);
    }
  }

  async function confirmSetGps() {
    if (!confirmGps) return;
    setSavingGps(true);
    try {
      await onSetGps(projectId, confirmGps.lat, confirmGps.lng);
      router.refresh();
    } finally {
      setSavingGps(false);
      setConfirmGps(null);
    }
  }

  async function confirmSetAddress() {
    if (!confirmAddress) return;
    setSavingAddress(true);
    try {
      await onSetAddress(projectId, confirmAddress.address);
      router.refresh();
    } finally {
      setSavingAddress(false);
      setConfirmAddress(null);
    }
  }

  function formatAddress(a: {
    street: string | null;
    houseNumber: string | null;
    city: string | null;
    zip: string | null;
    country: string | null;
  }) {
    const line1 = [a.street, a.houseNumber].filter(Boolean).join(" ");
    const line2 = [a.zip, a.city].filter(Boolean).join(" ");
    const parts = [line1, line2, a.country].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : "(prázdné)";
  }

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
        <p>
          Mapa vyžaduje Mapbox token — nastav <code className="rounded bg-muted px-1 py-0.5">NEXT_PUBLIC_MAPBOX_TOKEN</code>{" "}
          v prostředí aplikace.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Combobox
          items={suggestions}
          filter={null}
          itemToStringLabel={(item: PlaceSuggestion) => item.label}
          onValueChange={(item) => handleSearchSelect(item as PlaceSuggestion | null)}
          onInputValueChange={(value) => handleSearchInputChange(value)}
        >
          <ComboboxInputGroup className="w-full max-w-sm">
            <ComboboxIcon />
            <ComboboxInput placeholder="Hledat místo — adresa, obec, název…" />
          </ComboboxInputGroup>
          <ComboboxContent emptyLabel={searching ? "Hledám…" : "Nic nenalezeno"}>
            {(item: PlaceSuggestion) => (
              <ComboboxItem key={`${item.lat},${item.lng}`} value={item}>
                {item.label}
              </ComboboxItem>
            )}
          </ComboboxContent>
        </Combobox>
        <Select
          items={Object.fromEntries(Object.entries(MAP_STYLES).map(([key, s]) => [key, s.label]))}
          value={mapStyle}
          onValueChange={(v) => setMapStyle(v as MapStyleKey)}
        >
          <SelectTrigger className="w-36 shrink-0">
            <Layers className="size-4" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(MAP_STYLES).map(([key, s]) => (
              <SelectItem key={key} value={key}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {pending && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={() => setConfirmGps(pending)}>
            <MapPin className="size-4" />
            Přepsat GPS
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={lookingUpAddress} onClick={handleLookupAddress}>
            <Navigation className="size-4" />
            {lookingUpAddress ? "Hledám adresu…" : "Přepsat adresu"}
          </Button>
          {addressError && <span className="text-sm text-destructive">{addressError}</span>}
        </div>
      )}
      <div ref={mapContainerRef} className="h-80 w-full overflow-hidden rounded-lg border" />
      <div className="space-y-0.5 text-xs text-muted-foreground">
        <p>
          Uložené GPS:{" "}
          {applied ? `${applied.lat.toFixed(6)}, ${applied.lng.toFixed(6)}` : "zatím není nastaveno"}
        </p>
        {pending && (
          <p>
            Vybráno na mapě (zatím neuloženo): {pending.lat.toFixed(6)}, {pending.lng.toFixed(6)}
          </p>
        )}
        {!pending && !applied && <p>Klikni na mapu a vyber bod.</p>}
      </div>

      <Dialog open={confirmGps != null} onOpenChange={(open) => !open && setConfirmGps(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Přepsat GPS projektu?</DialogTitle>
            <DialogDescription>
              {applied
                ? `Aktuální GPS (${applied.lat.toFixed(6)}, ${applied.lng.toFixed(6)}) se přepíše na nově vybraný bod. Adresní pole (Ulice, Obec…) se tímhle neupraví.`
                : "Projekt zatím nemá GPS nastaveno. Adresní pole (Ulice, Obec…) se tímhle neupraví."}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm font-medium">
            Nové GPS: {confirmGps?.lat.toFixed(6)}, {confirmGps?.lng.toFixed(6)}
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setConfirmGps(null)}>
              Zrušit
            </Button>
            <Button type="button" size="sm" disabled={savingGps} onClick={confirmSetGps}>
              {savingGps ? "Ukládám…" : "Ano, přepsat GPS"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmAddress != null} onOpenChange={(open) => !open && setConfirmAddress(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Přepsat adresu projektu?</DialogTitle>
            <DialogDescription>
              Adresa nalezená pro vybraný bod na mapě přepíše pole Ulice/Číslo popisné/Obec/PSČ/Stát v sekci Místo
              realizace. GPS souřadnice se tímhle neupraví.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1 text-sm">
            <p className="text-muted-foreground">
              Současná adresa: <span className="text-foreground">{formatAddress(currentAddress)}</span>
            </p>
            <p className="font-medium">
              Nová adresa: {confirmAddress ? formatAddress(confirmAddress.address) : null}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setConfirmAddress(null)}>
              Zrušit
            </Button>
            <Button type="button" size="sm" disabled={savingAddress} onClick={confirmSetAddress}>
              {savingAddress ? "Ukládám…" : "Ano, přepsat adresu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
