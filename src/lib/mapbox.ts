// Mapbox: forward geocoding (adresa -> GPS, na serveru při uložení Projektu) a reverse
// geocoding (GPS -> adresa, z mapy v prohlížeči). Token je NEXT_PUBLIC_MAPBOX_TOKEN — je to
// scoped/public token určený přímo pro použití v klientovi (stejný jako pro vykreslení mapy),
// takže ho jde bezpečně použít i tady na serveru beze změny.

export interface GeocodedPoint {
  lat: number;
  lng: number;
}

export interface ReverseGeocodedAddress {
  street: string | null;
  houseNumber: string | null;
  city: string | null;
  zip: string | null;
  country: string | null;
}

export interface AddressFields {
  address_street?: string | null;
  address_house_number?: string | null;
  address_city?: string | null;
  address_zip?: string | null;
  address_country?: string | null;
}

export const ADDRESS_FIELD_KEYS = [
  "address_street",
  "address_house_number",
  "address_city",
  "address_zip",
  "address_country",
] as const satisfies readonly (keyof AddressFields)[];

/** Poskládá adresu z jednotlivých polí do jednoho dotazu pro Mapbox — `null`, pokud je prázdná. */
export function buildAddressQuery(fields: AddressFields): string | null {
  const line1 = [fields.address_street, fields.address_house_number].filter(Boolean).join(" ");
  const line2 = [fields.address_zip, fields.address_city].filter(Boolean).join(" ");
  const parts = [line1, line2, fields.address_country].map((p) => p?.trim()).filter((p): p is string => Boolean(p));
  return parts.length > 0 ? parts.join(", ") : null;
}

/**
 * True když se liší aspoň jedno adresní pole mezi uloženým a odeslaným stavem — hlídá, aby se
 * GPS přepočítalo z adresy jen při skutečné změně adresy, ne při libovolném jiném uložení
 * (které by jinak přepsalo ruční korekci polohy udělanou přes mapu).
 */
export function addressFieldsChanged(current: AddressFields, submitted: Record<string, unknown>): boolean {
  return ADDRESS_FIELD_KEYS.some(
    (key) => ((submitted[key] as string | null | undefined) ?? null) !== (current[key] ?? null),
  );
}

interface MapboxFeature {
  text?: string;
  address?: string;
  place_name?: string;
  center: [number, number];
  context?: { id: string; text: string }[];
}

interface MapboxGeocodingResponse {
  features?: MapboxFeature[];
}

const REQUEST_TIMEOUT_MS = 5000;

/** Adresa -> GPS. `null` když chybí token, adresa nedala žádný výsledek, nebo request selhal. */
export async function geocodeAddress(query: string): Promise<GeocodedPoint | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return null;

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&limit=1`;
  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) return null;

  const data = (await res.json()) as MapboxGeocodingResponse;
  const feature = data.features?.[0];
  if (!feature) return null;

  const [lng, lat] = feature.center;
  return { lat, lng };
}

export interface PlaceSuggestion {
  label: string;
  lat: number;
  lng: number;
}

/** Napovídání pro textové hledání na mapě — víc výsledků najednou, na rozdíl od `geocodeAddress`
 * (ten bere jen ten nejlepší, pro přesné geokódování uložené adresy). `null` bez tokenu/výsledku. */
export async function searchPlaces(query: string, limit = 5): Promise<PlaceSuggestion[]> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return [];

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&autocomplete=true&limit=${limit}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) return [];

  const data = (await res.json()) as MapboxGeocodingResponse;
  return (data.features ?? []).map((f) => ({
    label: f.place_name ?? f.text ?? query,
    lat: f.center[1],
    lng: f.center[0],
  }));
}

function contextValue(feature: MapboxFeature, idPrefix: string): string | null {
  return feature.context?.find((c) => c.id.startsWith(idPrefix))?.text ?? null;
}

/** Rozloží jeden Mapbox feature na naše adresní pole. */
export function parseMapboxFeatureToAddress(feature: MapboxFeature): ReverseGeocodedAddress {
  return {
    street: feature.text ?? null,
    houseNumber: feature.address ?? null,
    city: contextValue(feature, "place"),
    zip: contextValue(feature, "postcode")?.replace(/\s+/g, "") ?? null,
    country: contextValue(feature, "country"),
  };
}

/** GPS -> adresa (reverse geocoding), voláno z mapy v prohlížeči. `null` bez shody/tokenu. */
export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodedAddress | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return null;

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&types=address&limit=1`;
  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok) return null;

  const data = (await res.json()) as MapboxGeocodingResponse;
  const feature = data.features?.[0];
  return feature ? parseMapboxFeatureToAddress(feature) : null;
}
