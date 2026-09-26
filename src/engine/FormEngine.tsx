"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Plus, Ban, CheckCircle2, Trash2, RefreshCw } from "lucide-react";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Combobox,
  ComboboxInputGroup,
  ComboboxInput,
  ComboboxTrigger,
  ComboboxIcon,
  ComboboxContent,
  ComboboxItem,
} from "@/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CommandBar, CommandBarButton, CommandBarSeparator } from "@/components/shell/CommandBar";
import { RecordNavigator, type NavigatorRecord } from "./RecordNavigator";
import { ImageUpload } from "./ImageUpload";
import { AresCompanyLookup } from "@/components/AresCompanyLookup";
import { RuianAddressLookup } from "@/components/RuianAddressLookup";
import { cn } from "@/lib/utils";

import type { EntityDefinition, FormDefinition, FieldDefinition } from "./types";
import type { OptionSetValue } from "./optionSets";
import { buildEntityZodSchema, type EntityFormValues } from "./zodSchema";
import { entityRegistry } from "@/solutions/Projektant_CRM/registry";
import { deleteEntityRecord, setEntityStatus } from "./entityActions";

const STATUS_FIELD: FieldDefinition = {
  name: "status",
  label: "Stav",
  type: "optionset",
  required: true,
};

const STATUS_REASON_FIELD: FieldDefinition = {
  name: "status_reason_id",
  label: "Důvod stavu",
  type: "optionset",
  required: false,
};

const OWNER_FIELD: FieldDefinition = {
  name: "owner_id",
  label: "Vlastník",
  type: "lookup",
  targetEntity: "User",
  required: false,
};

/** Literal třídy, ať je Tailwind najde při buildu (dynamický string template by nešlo poznat). */
const COLUMN_CLASSES: Record<1 | 2 | 3, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3",
};

interface LookupOption {
  id: string;
  label: string;
}

export interface FormEngineProps {
  entity: EntityDefinition;
  form: FormDefinition;
  defaultValues?: Partial<EntityFormValues>;
  /** Hodnoty číselníků, klíč = option_sets.key (včetně entity.statusReasonOptionSetKey). */
  optionSetValues?: Record<string, OptionSetValue[]>;
  /** Možnosti pro lookup pole, klíč = FieldDefinition.targetEntity. */
  lookupOptions?: Record<string, LookupOption[]>;
  onSubmit: (values: EntityFormValues) => Promise<void>;
  submitLabel?: string;
  /** Seznam záznamů pro postranní navigátor (jen u existujícího záznamu) — viz RecordNavigator. */
  navigator?: { viewLabel: string; records: NavigatorRecord[] };
}

function resolveField(entity: EntityDefinition, name: string): FieldDefinition {
  if (name === "status") return STATUS_FIELD;
  if (name === "status_reason_id" || name === "status_reason") return STATUS_REASON_FIELD;
  if (name === "owner_id" || name === "owner") return OWNER_FIELD;
  const field = entity.fields.find((f) => f.name === name);
  if (!field) {
    throw new Error(`FormEngine: pole "${name}" není definované v entitě "${entity.name}".`);
  }
  return field;
}

export function FormEngine({
  entity,
  form,
  defaultValues,
  optionSetValues = {},
  lookupOptions = {},
  onSubmit,
  submitLabel = "Uložit",
  navigator,
}: FormEngineProps) {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const router = useRouter();
  const closePath = entityRegistry[entity.name]?.basePath ?? null;
  const currentId = defaultValues?.id as string | undefined;
  const [status, setStatus] = useState((defaultValues?.status as string | undefined) ?? "active");
  // Sdílené mezi všemi aresLookup poli tohoto formuláře — vybrání na jednom (např. Název)
  // programově přepíše i sesterská pole (IČO, adresa…), což by bez tohohle jinak znovu
  // spustilo JEJICH vlastní ARES hledání. Viz AresCompanyLookup.tsx.
  const aresSuppressSearchRef = useRef(false);

  async function toggleStatus() {
    if (!currentId || !closePath) return;
    setStatusBusy(true);
    try {
      const next = status === "active" ? "inactive" : "active";
      await setEntityStatus(entity.table, closePath, currentId, next);
      setStatus(next);
      router.refresh();
    } finally {
      setStatusBusy(false);
      setDeactivateOpen(false);
    }
  }

  // Deaktivace záznamu se dělá napříč celou appkou a nenápadně ho vyřadí z výchozích
  // (aktivních) filtrů/výběrů jinde — proto potvrzovací dialog. Aktivace zpátky (opak) je
  // svým způsobem "undo" a potvrzení nepotřebuje.
  function handleToggleStatusClick() {
    if (status === "active") setDeactivateOpen(true);
    else toggleStatus();
  }

  async function confirmDelete() {
    if (!currentId || !closePath) return;
    setDeleteBusy(true);
    try {
      await deleteEntityRecord(entity.table, closePath, currentId);
    } finally {
      setDeleteBusy(false);
    }
  }

  const schema = buildEntityZodSchema(entity);
  const {
    control,
    handleSubmit,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = useForm<EntityFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { status: "active", ...defaultValues },
  });

  // Důvod stavu patří ke konkrétnímu stavu (D365 vzor) — combobox níž nabízí jen důvody platné
  // pro tenhle živý (ne jen výchozí) stav, ať nejde vybrat "Neaktivní" jako důvod u záznamu,
  // co zůstává "Aktivní". Aktuálně vybraná hodnota se navíc drží zvlášť, ať se u starších
  // (už nesedících) záznamů nezobrazí prázdno.
  const watchedStatus = useWatch({ control, name: "status" }) as string | undefined;
  const watchedStatusReasonId = useWatch({ control, name: "status_reason_id" }) as string | undefined;

  // react-hook-form only reads `defaultValues` once, at mount — a parent Server Component
  // re-render (e.g. router.refresh() after another panel on the same page saves something,
  // like the location map writing a new address) passes a fresh `defaultValues` prop that
  // would otherwise never reach the form. Re-sync unless the user has unsaved edits in progress.
  useEffect(() => {
    if (!isDirty) reset({ status: "active", ...defaultValues });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultValues]);

  const makeSubmitHandler = (closeAfter: boolean) => async (values: EntityFormValues) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit(values);
      // Pro nový záznam server action sama přesměruje na nově vzniklý záznam —
      // tahle navigace se pak nestihne uplatnit, což je v pořádku (uvidí ho hned).
      if (closeAfter && closePath) router.push(closePath);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Uložení se nezdařilo.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(makeSubmitHandler(false))} className="space-y-8">
      <CommandBar className="sticky top-0 z-10 -mx-6 -mt-6 mb-2 bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        {navigator && currentId && closePath && (
          <>
            <RecordNavigator
              basePath={closePath}
              currentId={currentId}
              viewLabel={navigator.viewLabel}
              records={navigator.records}
            />
            <CommandBarSeparator />
          </>
        )}
        {currentId && closePath && (
          <CommandBarButton icon={Plus} label="Nový" href={`${closePath}/new`} />
        )}
        {currentId && closePath && (
          <>
            <CommandBarButton
              icon={status === "active" ? Ban : CheckCircle2}
              label={status === "active" ? "Deaktivovat" : "Aktivovat"}
              onClick={handleToggleStatusClick}
              disabled={statusBusy}
            />
            <Dialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Deaktivovat záznam?</DialogTitle>
                  <DialogDescription>
                    Aktivní → Neaktivní. Záznam zůstane zachovaný, ale zmizí z výchozích (aktivních)
                    filtrů, výběrů a vyhledávání jinde v appce.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDeactivateOpen(false)} disabled={statusBusy}>
                    Zrušit
                  </Button>
                  <Button onClick={toggleStatus} disabled={statusBusy}>
                    {statusBusy ? "Deaktivuji…" : "Ano, deaktivovat"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <DialogTrigger
                render={
                  <Button variant="ghost" size="sm" className="gap-1.5 text-foreground/80 hover:text-foreground">
                    <Trash2 className="size-4" />
                    Odstranit
                  </Button>
                }
              />
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Odstranit záznam?</DialogTitle>
                  <DialogDescription>
                    Tuhle akci nejde vzít zpět. Pokud jde jen o to záznam přestat používat, zvaž
                    místo toho tlačítko &quot;Deaktivovat&quot;.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleteBusy}>
                    Zrušit
                  </Button>
                  <Button variant="destructive" onClick={confirmDelete} disabled={deleteBusy}>
                    {deleteBusy ? "Odstraňuji…" : "Odstranit"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <CommandBarButton icon={RefreshCw} label="Aktualizovat" onClick={() => router.refresh()} />
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          {submitError && <p className="text-sm text-destructive">{submitError}</p>}
          {!currentId ? (
            // Nový záznam: Zpět musí jít vždycky, i po rozepsání formuláře — jinak
            // se z rozdělaného nového záznamu nedá dostat pryč jinak než uložením.
            <>
              {closePath && (
                <Button type="button" variant="outline" render={<Link href={closePath} />}>
                  Zpět
                </Button>
              )}
              <Button type="button" disabled={submitting} onClick={handleSubmit(makeSubmitHandler(false))}>
                {submitting ? "Ukládám…" : submitLabel}
              </Button>
            </>
          ) : isDirty ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={handleSubmit(makeSubmitHandler(false))}
              >
                {submitting ? "Ukládám…" : submitLabel}
              </Button>
              <Button type="button" disabled={submitting} onClick={handleSubmit(makeSubmitHandler(true))}>
                {submitting ? "Ukládám…" : `${submitLabel} a zavřít`}
              </Button>
            </>
          ) : (
            closePath && (
              <Button type="button" variant="outline" render={<Link href={closePath} />}>
                Zavřít
              </Button>
            )
          )}
        </div>
      </CommandBar>
      {form.tabs.map((tab) => (
        <div key={tab.label} className="space-y-6">
          <h2 className="text-lg font-semibold">{tab.label}</h2>
          {tab.sections.map((section) => (
            <div key={section.label} className="space-y-4 rounded-lg border p-4">
              <h3 className="text-sm font-medium text-muted-foreground">{section.label}</h3>
              {section.ruianLookup && (
                <RuianAddressLookup
                  setValue={setValue}
                  hasGps={entity.fields.some((f) => f.name === "gps_lat")}
                />
              )}
              <div className={cn("grid gap-4", COLUMN_CLASSES[form.columns ?? 2])}>
                {section.fields.map((fieldName) => {
                  const rawField = resolveField(entity, fieldName);
                  const locked = Boolean(rawField.lockOnceSet && defaultValues?.[rawField.name]);
                  const field = locked ? { ...rawField, readOnly: true } : rawField;
                  const error = errors[field.name];
                  const options =
                    field.name === "status_reason_id"
                      ? (optionSetValues[entity.statusReasonOptionSetKey] ?? []).filter(
                          (opt) =>
                            !opt.status_scope ||
                            opt.status_scope === watchedStatus ||
                            opt.id === watchedStatusReasonId,
                        )
                      : field.optionSetKey
                        ? optionSetValues[field.optionSetKey] ?? []
                        : [];
                  const lookups = field.targetEntity ? lookupOptions[field.targetEntity] ?? [] : [];

                  return (
                    <div key={field.name} className="space-y-1.5">
                      <Label htmlFor={field.name}>
                        {field.label}
                        {field.required && <span className="text-destructive"> *</span>}
                      </Label>

                      <Controller
                        name={field.name}
                        control={control}
                        render={({ field: rhf }) => {
                          if (field.name === "status") {
                            return (
                              <Select
                                items={{ active: "Aktivní", inactive: "Neaktivní" }}
                                value={String(rhf.value ?? "active")}
                                onValueChange={rhf.onChange}
                              >
                                <SelectTrigger id={field.name} className="w-full">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="active">Aktivní</SelectItem>
                                  <SelectItem value="inactive">Neaktivní</SelectItem>
                                </SelectContent>
                              </Select>
                            );
                          }

                          if (field.type === "optionset") {
                            return (
                              <Select
                                items={Object.fromEntries(options.map((opt) => [opt.id, opt.label]))}
                                value={rhf.value ? String(rhf.value) : ""}
                                onValueChange={rhf.onChange}
                                disabled={field.readOnly}
                              >
                                <SelectTrigger id={field.name} className="w-full">
                                  <SelectValue placeholder="Vyberte…" />
                                </SelectTrigger>
                                <SelectContent>
                                  {options.map((opt) => (
                                    <SelectItem key={opt.id} value={opt.id}>
                                      {opt.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            );
                          }

                          if (field.type === "lookup") {
                            const linkBasePath = field.targetEntity
                              ? entityRegistry[field.targetEntity]?.basePath
                              : null;
                            const linkHref =
                              linkBasePath && rhf.value ? `${linkBasePath}/${rhf.value}` : null;
                            const comboItems = lookups.map((opt) => ({ value: opt.id, label: opt.label }));
                            const selectedCombo =
                              comboItems.find((opt) => opt.value === rhf.value) ?? null;
                            return (
                              <div className="flex items-center gap-1.5">
                                <Combobox
                                  items={comboItems}
                                  value={selectedCombo}
                                  onValueChange={(item) => rhf.onChange(item?.value ?? "")}
                                  disabled={field.readOnly}
                                >
                                  <ComboboxInputGroup className="w-full">
                                    <ComboboxIcon />
                                    <ComboboxInput id={field.name} placeholder="Hledat…" />
                                    <ComboboxTrigger />
                                  </ComboboxInputGroup>
                                  <ComboboxContent emptyLabel="Nic nenalezeno">
                                    {(item: { value: string; label: string }) => (
                                      <ComboboxItem key={item.value} value={item}>
                                        {item.label}
                                      </ComboboxItem>
                                    )}
                                  </ComboboxContent>
                                </Combobox>
                                {linkHref && (
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    className="shrink-0"
                                    title="Otevřít záznam"
                                    render={<Link href={linkHref} />}
                                  >
                                    <ArrowUpRight className="size-4" />
                                  </Button>
                                )}
                              </div>
                            );
                          }

                          if (field.type === "image") {
                            return (
                              <ImageUpload
                                bucket={field.storageBucket ?? "public"}
                                value={(rhf.value as string | null) ?? null}
                                onChange={rhf.onChange}
                                disabled={field.readOnly}
                              />
                            );
                          }

                          if (field.type === "boolean") {
                            return (
                              <Checkbox
                                id={field.name}
                                checked={Boolean(rhf.value)}
                                onCheckedChange={rhf.onChange}
                                disabled={field.readOnly}
                              />
                            );
                          }

                          if (field.type === "textarea") {
                            return (
                              <Textarea
                                id={field.name}
                                value={(rhf.value as string) ?? ""}
                                onChange={rhf.onChange}
                                disabled={field.readOnly}
                              />
                            );
                          }

                          const inputType =
                            field.type === "number" || field.type === "currency"
                              ? "number"
                              : field.type === "date"
                                ? "date"
                                : field.type === "datetime"
                                  ? "datetime-local"
                                  : field.type === "email"
                                    ? "email"
                                    : "text";

                          return (
                            <Input
                              id={field.name}
                              type={inputType}
                              value={(rhf.value as string | number) ?? ""}
                              onChange={rhf.onChange}
                              disabled={field.readOnly}
                            />
                          );
                        }}
                      />

                      {field.aresLookup && (
                        <AresCompanyLookup
                          control={control}
                          setValue={setValue}
                          watchField={field.name}
                          mode={field.aresLookup}
                          legalFormOptions={optionSetValues.pravni_forma ?? []}
                          suppressSearchRef={aresSuppressSearchRef}
                        />
                      )}

                      {error && (
                        <p className="text-sm text-destructive">{String(error.message)}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ))}

    </form>
  );
}
