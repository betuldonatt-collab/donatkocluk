"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, FolderInput, FolderPlus, Folders, ImageOff, Images, Inbox, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { friendlyError } from "@/lib/friendly-error";
import {
  FOLDER_NAME_MAX,
  NO_FILTER,
  applyMove,
  courseOptions,
  filterPhotos,
  folderCounts,
  pathsToMove,
  type PhotoFilter,
  type PoolFolder,
  type PoolPhoto,
} from "@/lib/photo-pool";
import { cn } from "@/lib/utils";
import { createPhotoFolder, deletePhotoFolder, getPhotoUrls, movePhotosToFolder, renamePhotoFolder } from "./actions";

const PAGE = 60;

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}.${m}.${y}` : iso;
}

export function PhotoPoolGallery({
  studentId,
  initialPhotos,
  initialFolders,
  foldersAvailable,
}: {
  studentId: string;
  initialPhotos: PoolPhoto[];
  initialFolders: PoolFolder[];
  foldersAvailable: boolean;
}) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [folders, setFolders] = useState(initialFolders);
  const [filter, setFilter] = useState<PhotoFilter>(NO_FILTER);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState(PAGE);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The paths being dragged right now (empty = no drag in progress).
  const [dragPaths, setDragPaths] = useState<string[]>([]);
  const requested = useRef<Set<string>>(new Set());
  const urlsSeen = useRef<Record<string, string>>({});

  const counts = useMemo(() => folderCounts(photos), [photos]);
  const courses = useMemo(() => courseOptions(photos), [photos]);
  const visible = useMemo(() => filterPhotos(photos, filter), [photos, filter]);
  const page = visible.slice(0, shown);
  const lightboxPhoto = lightbox !== null ? visible[lightbox] : undefined;
  // The photos on screen, plus the one open in the lightbox (it can be past the loaded page when the coach steps through).
  const wanted = lightboxPhoto && !page.includes(lightboxPhoto) ? [...page, lightboxPhoto] : page;
  const folderName = useCallback((id: string | null) => folders.find((f) => f.id === id)?.name ?? null, [folders]);

  // Signed links are fetched only for the photos on screen (the bucket is private), a batch at a time.
  useEffect(() => {
    const asked = requested.current;
    const seen = urlsSeen.current;
    const missing = wanted.map((p) => p.path).filter((path) => !asked.has(path));
    if (missing.length === 0) return;
    for (const path of missing) asked.add(path);
    let cancelled = false;
    (async () => {
      for (let i = 0; i < missing.length; i += 40) {
        const batch = missing.slice(i, i + 40);
        try {
          const result = await getPhotoUrls(studentId, batch);
          if (cancelled) return;
          if (result.ok) {
            Object.assign(seen, result.urls);
            setUrls((prev) => ({ ...prev, ...result.urls }));
          }
          else for (const path of batch) asked.delete(path);
        } catch {
          for (const path of batch) asked.delete(path);
        }
      }
    })();
    return () => {
      cancelled = true;
      // a cancelled run leaves its unfinished batches to be asked for again
      for (const path of missing) if (!seen[path]) asked.delete(path);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted.map((p) => p.path).join("|"), studentId]);

  function changeFilter(next: Partial<PhotoFilter>) {
    setFilter((prev) => ({ ...prev, ...next }));
    setShown(PAGE);
  }

  function toggle(path: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  async function move(paths: string[], target: string | null) {
    if (paths.length === 0 || busy) return;
    const before = photos;
    const moving = new Set(paths);
    setPhotos((prev) => applyMove(prev, moving, target));
    setSelected(new Set());
    setBusy(true);
    try {
      const result = await movePhotosToFolder(studentId, paths, target);
      if (!result.ok) {
        setPhotos(before);
        toast.error(result.error);
        return;
      }
      toast.success(target ? `${paths.length} fotoğraf "${folderName(target)}" klasörüne taşındı.` : `${paths.length} fotoğraf klasörden çıkarıldı.`);
    } catch (e) {
      setPhotos(before);
      toast.error(friendlyError(e, "Fotoğraflar taşınamadı."));
    } finally {
      setBusy(false);
    }
  }

  async function addFolder() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await createPhotoFolder(studentId, newName);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setFolders((prev) => [...prev, result.folder]);
      setNewName("");
      setNewFolderOpen(false);
    } catch (e) {
      toast.error(friendlyError(e, "Klasör oluşturulamadı."));
    } finally {
      setBusy(false);
    }
  }

  async function saveRename() {
    if (!renaming || busy) return;
    setBusy(true);
    try {
      const result = await renamePhotoFolder(studentId, renaming.id, renaming.name);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setFolders((prev) => prev.map((f) => (f.id === result.folder.id ? result.folder : f)));
      setRenaming(null);
    } catch (e) {
      toast.error(friendlyError(e, "Klasör yeniden adlandırılamadı."));
    } finally {
      setBusy(false);
    }
  }

  async function removeFolder(folder: PoolFolder) {
    if (busy) return;
    if (!window.confirm(`"${folder.name}" klasörü silinsin mi? İçindeki fotoğraflar silinmez, "Klasörsüz" bölümüne döner.`)) return;
    setBusy(true);
    try {
      const result = await deletePhotoFolder(studentId, folder.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setFolders((prev) => prev.filter((f) => f.id !== folder.id));
      setPhotos((prev) => prev.map((p) => (p.folderId === folder.id ? { ...p, folderId: null } : p)));
      if (filter.folder === folder.id) changeFilter({ folder: "all" });
    } catch (e) {
      toast.error(friendlyError(e, "Klasör silinemedi."));
    } finally {
      setBusy(false);
    }
  }

  function dropOn(event: React.DragEvent, target: string | null) {
    event.preventDefault();
    setDropTarget(null);
    const paths = dragPaths;
    setDragPaths([]);
    void move(paths, target);
  }

  const dropProps = (key: string, target: string | null) => ({
    onDragOver: (e: React.DragEvent) => {
      if (dragPaths.length === 0) return;
      e.preventDefault();
      setDropTarget(key);
    },
    onDragLeave: () => setDropTarget((cur) => (cur === key ? null : cur)),
    onDrop: (e: React.DragEvent) => dropOn(e, target),
  });

  const entryClass = (active: boolean, key: string) =>
    cn(
      "group flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
      active ? "bg-primary/10 text-foreground font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      dropTarget === key && "ring-primary bg-primary/15 ring-2",
    );

  if (photos.length === 0) {
    return (
      <EmptyState
        icon={Images}
        title="Henüz fotoğraf yok"
        description="Öğrenci görevlerine Kanıt Fotoğrafı yüklediğinde burada toplanır."
      />
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      {/* Klasörler */}
      <aside className="space-y-1 lg:sticky lg:top-4 lg:self-start">
        <p className="text-muted-foreground mb-1 px-2.5 text-xs font-medium tracking-wide uppercase">Klasörler</p>
        <button type="button" className={entryClass(filter.folder === "all", "all")} onClick={() => changeFilter({ folder: "all" })}>
          <Images className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">Tümü</span>
          <span className="text-xs tabular-nums">{counts.all}</span>
        </button>
        <button
          type="button"
          className={entryClass(filter.folder === "none", "none")}
          onClick={() => changeFilter({ folder: "none" })}
          {...(foldersAvailable ? dropProps("none", null) : {})}
        >
          <Inbox className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">Klasörsüz</span>
          <span className="text-xs tabular-nums">{counts.none}</span>
        </button>

        {folders.map((folder) =>
          renaming?.id === folder.id ? (
            <form
              key={folder.id}
              className="flex items-center gap-1 px-1"
              onSubmit={(e) => {
                e.preventDefault();
                void saveRename();
              }}
            >
              <Input
                autoFocus
                value={renaming.name}
                maxLength={FOLDER_NAME_MAX}
                onChange={(e) => setRenaming({ id: folder.id, name: e.target.value })}
                onKeyDown={(e) => e.key === "Escape" && setRenaming(null)}
                className="h-8"
                aria-label="Klasör adı"
              />
              <Button type="submit" size="icon" variant="ghost" className="size-8" disabled={busy} aria-label="Kaydet">
                <Check className="size-4" />
              </Button>
              <Button type="button" size="icon" variant="ghost" className="size-8" onClick={() => setRenaming(null)} aria-label="Vazgeç">
                <X className="size-4" />
              </Button>
            </form>
          ) : (
            <div key={folder.id} className="group/row relative" {...dropProps(folder.id, folder.id)}>
              <button type="button" className={entryClass(filter.folder === folder.id, folder.id)} onClick={() => changeFilter({ folder: folder.id })}>
                <Folders className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                <span className="text-xs tabular-nums group-hover/row:opacity-0">{counts.byFolder.get(folder.id) ?? 0}</span>
              </button>
              <div className="absolute inset-y-0 right-1 hidden items-center gap-0.5 group-hover/row:flex group-focus-within/row:flex">
                <Button type="button" size="icon" variant="ghost" className="size-7" onClick={() => setRenaming({ id: folder.id, name: folder.name })} aria-label={`${folder.name} klasörünü yeniden adlandır`}>
                  <Pencil className="size-3.5" />
                </Button>
                <Button type="button" size="icon" variant="ghost" className="size-7" onClick={() => void removeFolder(folder)} aria-label={`${folder.name} klasörünü sil`}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          ),
        )}

        {foldersAvailable ? (
          newFolderOpen ? (
            <form
              className="flex items-center gap-1 px-1 pt-1"
              onSubmit={(e) => {
                e.preventDefault();
                void addFolder();
              }}
            >
              <Input
                autoFocus
                value={newName}
                maxLength={FOLDER_NAME_MAX}
                placeholder="Örn. Soru Bankası"
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setNewFolderOpen(false)}
                className="h-8"
                aria-label="Yeni klasör adı"
              />
              <Button type="submit" size="icon" variant="ghost" className="size-8" disabled={busy || newName.trim() === ""} aria-label="Klasör oluştur">
                <Check className="size-4" />
              </Button>
              <Button type="button" size="icon" variant="ghost" className="size-8" onClick={() => setNewFolderOpen(false)} aria-label="Vazgeç">
                <X className="size-4" />
              </Button>
            </form>
          ) : (
            <Button type="button" variant="outline" size="sm" className="mt-2 w-full justify-start" onClick={() => setNewFolderOpen(true)}>
              <FolderPlus className="size-4" />
              Yeni Klasör / Filtre Ekle
            </Button>
          )
        ) : (
          <p className="text-muted-foreground px-2.5 pt-2 text-xs">Klasörler için veritabanı güncellemesi (0139) çalıştırılmalı.</p>
        )}
      </aside>

      {/* Galeri */}
      <section className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-muted-foreground flex flex-col gap-1 text-xs">
            Ders
            <select
              value={filter.course}
              onChange={(e) => changeFilter({ course: e.target.value })}
              className="border-input bg-background text-foreground h-9 min-w-44 rounded-md border px-2 text-sm"
            >
              <option value="all">Tüm dersler ({counts.all})</option>
              {courses.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label} ({c.count})
                </option>
              ))}
            </select>
          </label>
          <label className="text-muted-foreground flex flex-col gap-1 text-xs">
            Başlangıç tarihi
            <Input type="date" value={filter.from} max={filter.to || undefined} onChange={(e) => changeFilter({ from: e.target.value })} className="h-9 w-40" />
          </label>
          <label className="text-muted-foreground flex flex-col gap-1 text-xs">
            Bitiş tarihi
            <Input type="date" value={filter.to} min={filter.from || undefined} onChange={(e) => changeFilter({ to: e.target.value })} className="h-9 w-40" />
          </label>
          {(filter.course !== "all" || filter.from || filter.to) && (
            <Button type="button" variant="ghost" size="sm" onClick={() => changeFilter({ course: "all", from: "", to: "" })}>
              <X className="size-4" />
              Filtreleri temizle
            </Button>
          )}
          <p className="text-muted-foreground ml-auto text-sm tabular-nums">{visible.length} fotoğraf</p>
        </div>

        {/* Seçim çubuğu */}
        <div className="bg-muted/50 flex min-h-11 flex-wrap items-center gap-2 rounded-md border px-3 py-1.5">
          {selected.size > 0 ? (
            <>
              <span className="text-sm font-medium tabular-nums">{selected.size} seçili</span>
              {foldersAvailable && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" size="sm" disabled={busy}>
                      <FolderInput className="size-4" />
                      Taşı
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuLabel>Şuraya taşı</DropdownMenuLabel>
                    {folders.map((f) => (
                      <DropdownMenuItem key={f.id} onSelect={() => void move([...selected], f.id)}>
                        <Folders className="size-4" />
                        {f.name}
                      </DropdownMenuItem>
                    ))}
                    {folders.length > 0 && <DropdownMenuSeparator />}
                    <DropdownMenuItem onSelect={() => void move([...selected], null)}>
                      <Inbox className="size-4" />
                      Klasörsüz
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Seçimi temizle
              </Button>
            </>
          ) : (
            <span className="text-muted-foreground text-sm">
              {foldersAvailable ? "Fotoğrafları seçip Taşı’yı kullan veya bir klasöre sürükleyip bırak." : "Fotoğrafları görüntüle ve filtrele."}
            </span>
          )}
          {visible.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="ml-auto"
              onClick={() => setSelected(selected.size === visible.length ? new Set() : new Set(visible.map((p) => p.path)))}
            >
              {selected.size === visible.length ? "Hiçbirini seçme" : `Tümünü seç (${visible.length})`}
            </Button>
          )}
        </div>

        {visible.length === 0 ? (
          <EmptyState icon={ImageOff} title="Bu filtreyle fotoğraf yok" description="Klasörü veya filtreleri değiştirmeyi dene." />
        ) : (
          <>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {page.map((photo, index) => {
                const isSelected = selected.has(photo.path);
                const url = urls[photo.path];
                return (
                  <li
                    key={photo.path}
                    draggable={foldersAvailable}
                    onDragStart={(e) => {
                      setDragPaths(pathsToMove(photo.path, selected));
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", photo.path);
                    }}
                    onDragEnd={() => {
                      setDragPaths([]);
                      setDropTarget(null);
                    }}
                    className={cn("group/card bg-card relative overflow-hidden rounded-lg border", isSelected && "ring-primary ring-2")}
                  >
                    <button type="button" className="bg-muted relative block aspect-square w-full" onClick={() => setLightbox(index)} aria-label={`${photo.taskTitle} fotoğrafını büyüt`}>
                      {url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={url} alt={photo.taskTitle} loading="lazy" draggable={false} className="size-full object-cover" />
                      ) : (
                        <span className="text-muted-foreground flex size-full items-center justify-center text-xs">Yükleniyor...</span>
                      )}
                    </button>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={isSelected}
                      aria-label="Fotoğrafı seç"
                      onClick={() => toggle(photo.path)}
                      className={cn(
                        "absolute top-2 left-2 flex size-6 items-center justify-center rounded-md border-2 border-white bg-black/40 text-white shadow transition-opacity",
                        isSelected ? "bg-primary border-primary opacity-100" : "opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100",
                        selected.size > 0 && "opacity-100",
                      )}
                    >
                      {isSelected && <Check className="size-4" />}
                    </button>
                    {photo.verdict === "rejected" && (
                      <span className="absolute top-2 right-2 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-medium text-white">Onaylanmadı</span>
                    )}
                    <div className="space-y-0.5 p-2 text-xs">
                      <p className="truncate font-medium">{photo.courseLabel}</p>
                      <p className="text-muted-foreground truncate">
                        {formatDate(photo.taskDate)} · {photo.taskTitle}
                      </p>
                      {photo.folderId && filter.folder === "all" && (
                        <p className="text-primary flex items-center gap-1 truncate">
                          <Folders className="size-3 shrink-0" />
                          {folderName(photo.folderId)}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {shown < visible.length && (
              <div className="flex justify-center">
                <Button type="button" variant="outline" onClick={() => setShown((n) => n + PAGE)}>
                  Daha fazla göster ({visible.length - shown} kaldı)
                </Button>
              </div>
            )}
          </>
        )}
      </section>

      {/* Büyütülmüş fotoğraf */}
      <Dialog open={lightbox !== null} onOpenChange={(open) => !open && setLightbox(null)}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{lightboxPhoto?.taskTitle ?? "Fotoğraf"}</DialogTitle>
            <DialogDescription>
              {lightboxPhoto ? `${lightboxPhoto.courseLabel} · ${formatDate(lightboxPhoto.taskDate)}${lightboxPhoto.folderId ? ` · ${folderName(lightboxPhoto.folderId)}` : ""}` : ""}
            </DialogDescription>
          </DialogHeader>
          {lightboxPhoto && (
            <div className="flex items-center gap-2">
              <Button type="button" size="icon" variant="ghost" disabled={lightbox === 0} onClick={() => setLightbox((i) => (i === null ? i : Math.max(0, i - 1)))} aria-label="Önceki fotoğraf">
                <ChevronLeft className="size-5" />
              </Button>
              <div className="bg-muted flex min-h-60 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-md">
                {urls[lightboxPhoto.path] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={urls[lightboxPhoto.path]} alt={lightboxPhoto.taskTitle} className="max-h-[70dvh] w-auto max-w-full object-contain" />
                ) : (
                  <span className="text-muted-foreground text-sm">Yükleniyor...</span>
                )}
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                disabled={lightbox === visible.length - 1}
                onClick={() => setLightbox((i) => (i === null ? i : Math.min(visible.length - 1, i + 1)))}
                aria-label="Sonraki fotoğraf"
              >
                <ChevronRight className="size-5" />
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
