"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createRecord, listRecords, getRecordById } from "@/engine/Database";
import { updateEntityRecord } from "@/engine/entityActions";
import { computeMilestoneDueDates } from "@/engine/milestoneDates";
import { ADDRESS_FIELD_KEYS, addressFieldsChanged, buildAddressQuery, geocodeAddress, type AddressFields } from "@/lib/mapbox";
import type { EntityFormValues } from "@/engine/zodSchema";
import entity from "@/solutions/Projektant_CRM/Entities/Project/Entity.json";

const BASE_PATH = "/projects";

/**
 * Přepočte GPS z adresních polí v `values` — jen když je z čeho (aspoň jedno adresní pole
 * vyplněné). `null` znamená "adresu se nepodařilo geokódovat" (chybí token, nenalezeno, chyba
 * API) — volající pak GPS ponechá beze změny, ne přepíše nulami (viz volající kód níže).
 */
async function geocodeFromValues(values: EntityFormValues) {
  const query = buildAddressQuery({
    address_street: values.address_street as string | undefined,
    address_house_number: values.address_house_number as string | undefined,
    address_city: values.address_city as string | undefined,
    address_zip: values.address_zip as string | undefined,
    address_country: values.address_country as string | undefined,
  });
  if (!query) return { gps_lat: null, gps_lng: null };

  const point = await geocodeAddress(query);
  if (!point) return null;
  return { gps_lat: point.lat, gps_lng: point.lng };
}

interface GpsFields {
  gps_lat: number | null;
  gps_lng: number | null;
}

function toCoordinate(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/**
 * Souřadnice, které formulář posílá s sebou. Vybráním adresy v RÚIAN (viz RuianAddressLookup)
 * přijde přesný bod přímo z registru — ten nemá smysl přegeokódovávat Mapboxem, který by pro
 * tutéž adresu vrátil vlastní, o kus jiný odhad.
 */
function submittedGps(values: EntityFormValues): GpsFields | null {
  const gps_lat = toCoordinate(values.gps_lat);
  const gps_lng = toCoordinate(values.gps_lng);
  return gps_lat !== null && gps_lng !== null ? { gps_lat, gps_lng } : null;
}

/** Zkopíruje Template_Milestones do Project_Milestones s dopočtem data (start + offset_dni). */
async function generateMilestonesFromTemplate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  templateId: string,
  startDate: string | null,
) {
  const templateMilestones = await listRecords<{ name: string; offset_dni: number }>(
    supabase,
    "template_milestones",
    { select: "name, offset_dni", filter: { template_id: templateId } },
  );

  if (templateMilestones.length === 0) return;

  const rows = computeMilestoneDueDates(templateMilestones, startDate).map((m) => ({
    project_id: projectId,
    ...m,
  }));

  const { error } = await supabase.from("project_milestones").insert(rows);
  if (error) throw error;
}

export async function createProject(values: EntityFormValues) {
  const supabase = await createClient();
  const gps = submittedGps(values) ?? (await geocodeFromValues(values));
  const record = await createRecord<{ id: string }>(supabase, entity.table, { ...values, ...gps });

  const templateId = values.project_template_id as string | null | undefined;
  if (templateId) {
    await generateMilestonesFromTemplate(
      supabase,
      record.id,
      templateId,
      (values.datum_zahajeni as string | null) ?? null,
    );
  }

  revalidatePath(BASE_PATH);
  redirect(`${BASE_PATH}/${record.id}`);
}

export async function updateProject(id: string, values: EntityFormValues) {
  const supabase = await createClient();

  // project_template_id je lockOnceSet (viz Entity.json), takže sem přijde
  // nová hodnota jen když byla předtím prázdná — šablona se poprvé vybírá až
  // teď při editaci, ne při založení. I tak vyloučeno raději načtením
  // aktuálního stavu, ať se milníky nevygenerují znovu při každém uložení.
  const templateId = values.project_template_id as string | null | undefined;
  let shouldGenerateMilestones = false;
  if (templateId) {
    const current = await getRecordById<{ project_template_id: string | null }>(
      supabase,
      entity.table,
      id,
      "project_template_id",
    );
    shouldGenerateMilestones = !current.project_template_id;
  }

  // GPS se přepočítá jen když se adresa opravdu změnila — jinak by každé uložení (i kvůli
  // nesouvisejícímu poli) přepsalo ruční korekci polohy udělanou přes mapu (viz
  // ProjectLocationMap.tsx "Přepsat GPS"). A když formulář přinese jiné souřadnice, než jaké
  // jsou uložené, nastavil je klient (výběr adresy v RÚIAN) a mají přednost před geokódováním.
  const current = await getRecordById<AddressFields & GpsFields>(
    supabase,
    entity.table,
    id,
    [...ADDRESS_FIELD_KEYS, "gps_lat", "gps_lng"].join(", "),
  );
  const submitted = submittedGps(values);
  const clientSetPoint =
    submitted !== null && (submitted.gps_lat !== current.gps_lat || submitted.gps_lng !== current.gps_lng);

  const gps = clientSetPoint
    ? submitted
    : addressFieldsChanged(current, values)
      ? await geocodeFromValues(values)
      : null;

  await updateEntityRecord(entity.table, BASE_PATH, id, { ...values, ...gps });

  if (shouldGenerateMilestones && templateId) {
    await generateMilestonesFromTemplate(
      supabase,
      id,
      templateId,
      (values.datum_zahajeni as string | null) ?? null,
    );
  }
}
