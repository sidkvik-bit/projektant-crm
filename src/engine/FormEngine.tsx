"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { useForm, Controller } from "react-hook-form";
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

import type { EntityDefinition, FormDefinition, FieldDefinition } from "./types";
import type { OptionSetValue } from "./optionSets";
import { buildEntityZodSchema, type EntityFormValues } from "./zodSchema";
import { entityRegistry } from "@/solutions/Projektant_CRM/registry";

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
}: FormEngineProps) {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const router = useRouter();
  const closePath = entityRegistry[entity.name]?.basePath ?? null;

  const schema = buildEntityZodSchema(entity);
  const {
    control,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<EntityFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { status: "active", ...defaultValues },
  });

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
      <div className="sticky top-0 z-10 -mx-6 -mt-6 mb-2 flex items-center justify-end gap-2 border-b bg-background/95 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        {submitError && <p className="mr-auto text-sm text-destructive">{submitError}</p>}
        {isDirty ? (
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
      {form.tabs.map((tab) => (
        <div key={tab.label} className="space-y-6">
          <h2 className="text-lg font-semibold">{tab.label}</h2>
          {tab.sections.map((section) => (
            <div key={section.label} className="space-y-4 rounded-lg border p-4">
              <h3 className="text-sm font-medium text-muted-foreground">{section.label}</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {section.fields.map((fieldName) => {
                  const field = resolveField(entity, fieldName);
                  const error = errors[field.name];
                  const options =
                    field.name === "status_reason_id"
                      ? optionSetValues[entity.statusReasonOptionSetKey] ?? []
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
                            return (
                              <div className="flex items-center gap-1.5">
                                <Select
                                  items={Object.fromEntries(lookups.map((opt) => [opt.id, opt.label]))}
                                  value={rhf.value ? String(rhf.value) : ""}
                                  onValueChange={rhf.onChange}
                                  disabled={field.readOnly}
                                >
                                  <SelectTrigger id={field.name} className="w-full">
                                    <SelectValue placeholder="Vyberte…" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {lookups.map((opt) => (
                                      <SelectItem key={opt.id} value={opt.id}>
                                        {opt.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
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
