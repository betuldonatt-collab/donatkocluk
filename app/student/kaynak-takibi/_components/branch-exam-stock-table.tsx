"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type BranchExamResourceRef = { id: string; name: string; total_stock: number; remaining_stock: number };

// Editable AND creatable by the student themself (explicit product
// decision -- they self-manage their own branch-trial inventory,
// creation included). One cell edits at a time; committing always sends
// both counts (the DB action sets them directly, not by delta). Coach
// has the same capability -- see
// app/coach/students/[id]/_components/branch-exam-stock-table.tsx.
export function BranchExamStockTable({
  resources,
  onAdd,
  onUpdateStock,
}: {
  resources: BranchExamResourceRef[];
  onAdd: (name: string, totalStock: number, remainingStock: number) => Promise<void>;
  onUpdateStock: (resourceId: string, totalStock: number, remainingStock: number) => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTotalStock, setNewTotalStock] = useState("");
  const [newRemainingStock, setNewRemainingStock] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<{ id: string; field: "total" | "remaining" } | null>(null);
  const [editValue, setEditValue] = useState("");

  async function handleAdd() {
    const name = newName.trim();
    const total = Number(newTotalStock);
    const remaining = Number(newRemainingStock);
    if (!name || !Number.isFinite(total) || total < 0 || !Number.isFinite(remaining) || remaining < 0) return;
    setSaving(true);
    try {
      await onAdd(name, total, remaining);
      setNewName("");
      setNewTotalStock("");
      setNewRemainingStock("");
      setDialogOpen(false);
    } catch {
      // onAdd already surfaced a toast; keep the dialog open with input intact.
    } finally {
      setSaving(false);
    }
  }

  function startEdit(resource: BranchExamResourceRef, field: "total" | "remaining") {
    setEditing({ id: resource.id, field });
    setEditValue(String(field === "total" ? resource.total_stock : resource.remaining_stock));
  }

  function commitEdit(resource: BranchExamResourceRef) {
    if (editing) {
      const value = Number(editValue);
      if (Number.isFinite(value) && value >= 0) {
        onUpdateStock(
          resource.id,
          editing.field === "total" ? value : resource.total_stock,
          editing.field === "remaining" ? value : resource.remaining_stock,
        );
      }
    }
    setEditing(null);
  }

  function editableCell(resource: BranchExamResourceRef, field: "total" | "remaining") {
    const isEditing = editing?.id === resource.id && editing.field === field;
    if (isEditing) {
      return (
        <Input
          type="number"
          min={0}
          autoFocus
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => commitEdit(resource)}
          onKeyDown={(e) => e.key === "Enter" && commitEdit(resource)}
          className="mx-auto h-8 w-20 text-center"
        />
      );
    }
    const value = field === "total" ? resource.total_stock : resource.remaining_stock;
    return (
      <button type="button" onClick={() => startEdit(resource, field)} className="hover:bg-accent w-full rounded px-2 py-1 tabular-nums">
        {value}
      </button>
    );
  }

  if (resources.length === 0) {
    return (
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">Bu ders için henüz branş denemesi kaynağı eklenmedi.</p>
        <Button type="button" size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" />
          Branş Denemesi Ekle
        </Button>
        <AddDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          name={newName}
          totalStock={newTotalStock}
          remainingStock={newRemainingStock}
          onNameChange={setNewName}
          onTotalStockChange={setNewTotalStock}
          onRemainingStockChange={setNewRemainingStock}
          onAdd={handleAdd}
          saving={saving}
        />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Branş Denemesi Stoğu</CardTitle>
        <Button type="button" size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" />
          Branş Denemesi Ekle
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Yayınevi / Kaynak</TableHead>
              <TableHead className="text-center">Toplam Deneme</TableHead>
              <TableHead className="text-center">Kalan Deneme</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {resources.map((resource) => (
              <TableRow key={resource.id}>
                <TableCell className="font-medium">{resource.name}</TableCell>
                <TableCell className="text-center">{editableCell(resource, "total")}</TableCell>
                <TableCell className="text-center font-medium">{editableCell(resource, "remaining")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      </CardContent>

      <AddDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        name={newName}
        totalStock={newTotalStock}
        remainingStock={newRemainingStock}
        onNameChange={setNewName}
        onTotalStockChange={setNewTotalStock}
        onRemainingStockChange={setNewRemainingStock}
        onAdd={handleAdd}
        saving={saving}
      />
    </Card>
  );
}

function AddDialog({
  open,
  onOpenChange,
  name,
  totalStock,
  remainingStock,
  onNameChange,
  onTotalStockChange,
  onRemainingStockChange,
  onAdd,
  saving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  totalStock: string;
  remainingStock: string;
  onNameChange: (v: string) => void;
  onTotalStockChange: (v: string) => void;
  onRemainingStockChange: (v: string) => void;
  onAdd: () => void;
  saving: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Branş Denemesi Ekle</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="student-branch-exam-name">Yayınevi / Kaynak adı</Label>
            <Input id="student-branch-exam-name" placeholder="Örn: Anka Yayınları" value={name} onChange={(e) => onNameChange(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="student-branch-exam-total-stock">Toplam Stok</Label>
              <Input
                id="student-branch-exam-total-stock"
                type="number"
                min={0}
                inputMode="numeric"
                value={totalStock}
                onChange={(e) => onTotalStockChange(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="student-branch-exam-remaining-stock">Kalan Stok</Label>
              <Input
                id="student-branch-exam-remaining-stock"
                type="number"
                min={0}
                inputMode="numeric"
                value={remainingStock}
                onChange={(e) => onRemainingStockChange(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            İptal
          </Button>
          <Button type="button" disabled={saving || !name.trim() || !totalStock.trim() || !remainingStock.trim()} onClick={onAdd}>
            {saving ? "Ekleniyor..." : "Ekle"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
