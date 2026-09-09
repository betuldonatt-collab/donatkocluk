"use client";

import { useState } from "react";
import { Archive, Plus, RotateCcw, Trash2 } from "lucide-react";

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
import { cn } from "@/lib/utils";
import type { BranchExamResourceRef } from "./kaynak-takibi-tab";

// Deliberately simpler than EditableCourseTable -- no topic breakdown, no
// checklist. A branch trial is inventory (Toplam/Kalan); after creation,
// remaining_stock is normally maintained by the apply_branch_exam_stock_delta
// DB trigger (0044) as tasks complete, but at creation time both counts
// are prompted independently (e.g. a coach importing an already
// partially-used stock) -- editing Toplam afterward still adjusts Kalan
// by the delta (updateBranchExamStock).
//
// Archive/Delete reuse the exact same student_resources actions
// (archiveStudentResource/reactivateStudentResource/deleteStudentResource)
// EditableCourseTable's own resources already use -- that table isn't
// kind-specific, so no new server action was needed here.
export function BranchExamStockTable({
  resources,
  onAdd,
  onUpdateStock,
  onArchive,
  onReactivate,
  onDelete,
}: {
  resources: BranchExamResourceRef[];
  onAdd: (name: string, totalStock: number, remainingStock: number) => void;
  onUpdateStock: (resourceId: string, newTotalStock: number) => void;
  onArchive: (resourceId: string) => void;
  onReactivate: (resourceId: string) => void;
  onDelete: (resourceId: string) => Promise<void>;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTotalStock, setNewTotalStock] = useState("");
  const [newRemainingStock, setNewRemainingStock] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [pendingArchiveId, setPendingArchiveId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function handleAdd() {
    const name = newName.trim();
    const total = Number(newTotalStock);
    const remaining = Number(newRemainingStock);
    if (!name || !Number.isFinite(total) || total < 0 || !Number.isFinite(remaining) || remaining < 0) return;
    onAdd(name, total, remaining);
    setNewName("");
    setNewTotalStock("");
    setNewRemainingStock("");
    setDialogOpen(false);
  }

  function startEdit(resource: BranchExamResourceRef) {
    setEditingId(resource.id);
    setEditValue(String(resource.total_stock));
  }

  function commitEdit(resourceId: string) {
    const stock = Number(editValue);
    if (Number.isFinite(stock) && stock >= 0) onUpdateStock(resourceId, stock);
    setEditingId(null);
  }

  function handleConfirmArchive() {
    if (!pendingArchiveId) return;
    onArchive(pendingArchiveId);
    setPendingArchiveId(null);
  }

  async function handleConfirmDelete() {
    if (!pendingDeleteId) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDelete(pendingDeleteId);
      setPendingDeleteId(null);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Bir hata oluştu.");
    } finally {
      setDeleting(false);
    }
  }

  const pendingArchiveResource = resources.find((r) => r.id === pendingArchiveId);
  const pendingDeleteResource = resources.find((r) => r.id === pendingDeleteId);

  const addButton = (
    <Button type="button" size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
      <Plus className="size-4" />
      Branş Denemesi Ekle
    </Button>
  );

  const dialogs = (
    <>
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
      />

      <Dialog open={pendingArchiveId !== null} onOpenChange={(open) => !open && setPendingArchiveId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kaynağı Arşivle</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            {pendingArchiveResource ? `"${pendingArchiveResource.name}" a` : "Bu kaynak a"}rtık yeni görev atarken
            seçilemeyecek, ancak stok geçmişi korunacak. İstediğin zaman tekrar aktif edebilirsin.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingArchiveId(null)}>
              İptal
            </Button>
            <Button type="button" onClick={handleConfirmArchive}>
              Arşivle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteId(null);
            setDeleteError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kaynağı Kalıcı Sil</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            {pendingDeleteResource ? `"${pendingDeleteResource.name}"` : "Bu kaynağı"}{" "}
            <strong className="text-foreground">kalıcı olarak</strong> silmek istediğine emin misin? Bu işlem geri
            alınamaz. Geçmişi korumak istiyorsan bunun yerine arşivle.
          </p>
          {deleteError && <p className="text-destructive text-sm">{deleteError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingDeleteId(null)} disabled={deleting}>
              İptal
            </Button>
            <Button type="button" variant="destructive" onClick={handleConfirmDelete} disabled={deleting}>
              {deleting ? "Siliniyor..." : "Kalıcı Sil"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  if (resources.length === 0) {
    return (
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">Bu ders için henüz branş denemesi kaynağı eklenmedi.</p>
        {addButton}
        {dialogs}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Branş Denemesi Stoğu</CardTitle>
        {addButton}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Yayınevi / Kaynak</TableHead>
              <TableHead className="text-center">Toplam Deneme</TableHead>
              <TableHead className="text-center">Kalan Deneme</TableHead>
              <TableHead className="w-20 text-center">İşlemler</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {resources.map((resource) => (
              <TableRow key={resource.id} className={cn(!resource.is_active && "opacity-60")}>
                <TableCell className="font-medium">
                  {resource.name}
                  {!resource.is_active && (
                    <span className="text-muted-foreground ml-1.5 text-[11px] font-normal">(Arşivlendi)</span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  {editingId === resource.id ? (
                    <Input
                      type="number"
                      min={0}
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => commitEdit(resource.id)}
                      onKeyDown={(e) => e.key === "Enter" && commitEdit(resource.id)}
                      className="mx-auto h-8 w-20 text-center"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEdit(resource)}
                      className="hover:bg-accent w-full rounded px-2 py-1 tabular-nums"
                    >
                      {resource.total_stock}
                    </button>
                  )}
                </TableCell>
                <TableCell className="text-center font-medium tabular-nums">{resource.remaining_stock}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-center gap-1">
                    {resource.is_active ? (
                      <button
                        type="button"
                        onClick={() => setPendingArchiveId(resource.id)}
                        aria-label={`${resource.name} kaynağını arşivle`}
                        className="text-muted-foreground hover:text-amber-600 shrink-0 rounded p-1"
                      >
                        <Archive className="size-4" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onReactivate(resource.id)}
                        aria-label={`${resource.name} kaynağını aktif et`}
                        className="text-muted-foreground hover:text-emerald-600 shrink-0 rounded p-1"
                      >
                        <RotateCcw className="size-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setPendingDeleteId(resource.id)}
                      aria-label={`${resource.name} kaynağını kalıcı sil`}
                      className="text-muted-foreground hover:text-destructive shrink-0 rounded p-1"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      {dialogs}
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
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Branş Denemesi Ekle</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="branch-exam-name">Yayınevi / Kaynak adı</Label>
            <Input id="branch-exam-name" placeholder="Örn: Anka Yayınları" value={name} onChange={(e) => onNameChange(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="branch-exam-total-stock">Toplam Stok</Label>
              <Input
                id="branch-exam-total-stock"
                type="number"
                min={0}
                inputMode="numeric"
                value={totalStock}
                onChange={(e) => onTotalStockChange(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="branch-exam-remaining-stock">Kalan Stok</Label>
              <Input
                id="branch-exam-remaining-stock"
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
          <Button type="button" disabled={!name.trim() || !totalStock.trim() || !remainingStock.trim()} onClick={onAdd}>
            Ekle
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
