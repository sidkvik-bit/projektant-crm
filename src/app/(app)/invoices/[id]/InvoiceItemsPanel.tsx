"use client";

import { useState } from "react";
import { Trash2, Plus, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const currencyFormat = new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK" });

export interface InvoiceItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  line_total: number;
}

interface ItemDraft {
  name: string;
  quantity: string;
  unit: string;
  unitPrice: string;
}

const EMPTY_DRAFT: ItemDraft = { name: "", quantity: "1", unit: "ks", unitPrice: "0" };

export function InvoiceItemsPanel({
  invoiceId,
  items,
  vatRate,
  onAdd,
  onUpdate,
  onDelete,
}: {
  invoiceId: string;
  items: InvoiceItem[];
  vatRate: number;
  onAdd: (invoiceId: string, name: string, quantity: number, unit: string, unitPrice: number) => Promise<void>;
  onUpdate: (
    invoiceId: string,
    itemId: string,
    name: string,
    quantity: number,
    unit: string,
    unitPrice: number,
  ) => Promise<void>;
  onDelete: (invoiceId: string, itemId: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<ItemDraft>(EMPTY_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ItemDraft>(EMPTY_DRAFT);
  const [busyId, setBusyId] = useState<string | null>(null);

  const subtotal = items.reduce((sum, item) => sum + Number(item.line_total ?? 0), 0);
  const vatAmount = Math.round(subtotal * (vatRate / 100) * 100) / 100;
  const total = subtotal + vatAmount;

  async function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onAdd(invoiceId, draft.name, Number(draft.quantity) || 0, draft.unit, Number(draft.unitPrice) || 0);
      setDraft(EMPTY_DRAFT);
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(item: InvoiceItem) {
    setEditingId(item.id);
    setEditDraft({
      name: item.name,
      quantity: String(item.quantity),
      unit: item.unit,
      unitPrice: String(item.unit_price),
    });
  }

  async function handleEditSave(itemId: string) {
    setBusyId(itemId);
    try {
      await onUpdate(
        invoiceId,
        itemId,
        editDraft.name,
        Number(editDraft.quantity) || 0,
        editDraft.unit,
        Number(editDraft.unitPrice) || 0,
      );
      setEditingId(null);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(itemId: string) {
    setBusyId(itemId);
    try {
      await onDelete(invoiceId, itemId);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Popis
              </TableHead>
              <TableHead className="w-24 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Množství
              </TableHead>
              <TableHead className="w-20 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Jednotka
              </TableHead>
              <TableHead className="w-32 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Jednotková cena
              </TableHead>
              <TableHead className="w-32 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Celkem
              </TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  Zatím žádné položky.
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => {
                const isEditing = editingId === item.id;
                return (
                  <TableRow key={item.id} className="transition-colors hover:bg-accent/40">
                    {isEditing ? (
                      <>
                        <TableCell>
                          <Input
                            value={editDraft.name}
                            onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                            className="h-8"
                            autoFocus
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            value={editDraft.quantity}
                            onChange={(e) => setEditDraft((d) => ({ ...d, quantity: e.target.value }))}
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={editDraft.unit}
                            onChange={(e) => setEditDraft((d) => ({ ...d, unit: e.target.value }))}
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            value={editDraft.unitPrice}
                            onChange={(e) => setEditDraft((d) => ({ ...d, unitPrice: e.target.value }))}
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {currencyFormat.format((Number(editDraft.quantity) || 0) * (Number(editDraft.unitPrice) || 0))}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              disabled={busyId === item.id}
                              onClick={() => handleEditSave(item.id)}
                            >
                              <Check className="size-4" />
                            </Button>
                            <Button variant="ghost" size="icon-sm" onClick={() => setEditingId(null)}>
                              <X className="size-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className="text-muted-foreground">{item.quantity}</TableCell>
                        <TableCell className="text-muted-foreground">{item.unit}</TableCell>
                        <TableCell className="text-muted-foreground">{currencyFormat.format(item.unit_price)}</TableCell>
                        <TableCell className="text-right font-medium">{currencyFormat.format(item.line_total)}</TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon-sm" title="Upravit" onClick={() => startEdit(item)}>
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title="Odstranit položku"
                              disabled={busyId === item.id}
                              onClick={() => handleDelete(item.id)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        <div className="flex flex-col items-end gap-1 border-t bg-muted/30 px-4 py-3 text-sm">
          <div className="flex w-56 justify-between text-muted-foreground">
            <span>Mezisoučet</span>
            <span>{currencyFormat.format(subtotal)}</span>
          </div>
          <div className="flex w-56 justify-between text-muted-foreground">
            <span>DPH ({vatRate}%)</span>
            <span>{currencyFormat.format(vatAmount)}</span>
          </div>
          <div className="flex w-56 justify-between text-base font-semibold">
            <span>Celkem</span>
            <span>{currencyFormat.format(total)}</span>
          </div>
        </div>
      </div>

      <form onSubmit={handleAddSubmit} className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1 space-y-1.5">
          <Label htmlFor="item-name">Popis položky</Label>
          <Input
            id="item-name"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            required
          />
        </div>
        <div className="w-24 space-y-1.5">
          <Label htmlFor="item-quantity">Množství</Label>
          <Input
            id="item-quantity"
            type="number"
            min={0}
            step="any"
            value={draft.quantity}
            onChange={(e) => setDraft((d) => ({ ...d, quantity: e.target.value }))}
          />
        </div>
        <div className="w-20 space-y-1.5">
          <Label htmlFor="item-unit">Jednotka</Label>
          <Input
            id="item-unit"
            value={draft.unit}
            onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value }))}
          />
        </div>
        <div className="w-32 space-y-1.5">
          <Label htmlFor="item-price">Jednotková cena</Label>
          <Input
            id="item-price"
            type="number"
            min={0}
            step="any"
            value={draft.unitPrice}
            onChange={(e) => setDraft((d) => ({ ...d, unitPrice: e.target.value }))}
          />
        </div>
        <Button type="submit" disabled={submitting}>
          <Plus className="size-4" />
          Přidat
        </Button>
      </form>
    </div>
  );
}
