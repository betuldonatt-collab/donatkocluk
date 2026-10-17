"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, FolderInput, FolderPlus, Folders, ImageOff, Images, Inbox, Pencil, Trash2, Undo2, X } from "lucide-react";
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
  groupPhotos,
  pathsToMove,
  takeGroups,
  type PhotoFilter,
  type PoolFolder,
  type PoolPhoto,
} from "@/lib/photo-pool";
import { cn } from "@/lib/utils";
import {
  createPhotoFolder,
  deletePhotoFolder,
  getAnnotationUrls,
  getPhotoUrls,
  movePhotosToFolder,
  removePhotoAnnotation,
  renamePhotoFolder,
  saveAnnotatedPhoto,
} from "./actions";
import { PhotoEditor } from "./photo-editor";

const PAGE = 60;

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}.${m}.${y}` : iso;
}

// Signed links, fetched lazily and only for the keys asked for (the buckets are private), a batch at a time. `put` / `drop` let the caller
// set or forget a link itself (a freshly saved edit, a removed one).
function useLazyUrls(keys: string[], load: (batch: string[]) => Promise<{ ok: true; urls: Record<string, string> } | { ok: false }>) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const asked = useRef<Set<string>>(new Set());
  const seen = useRef<Record<string, string>>({});

  useEffect(() => {
    const askedSet = asked.current;
    const seenMap = seen.current;
    const missing = keys.filter((k) => !askedSet.has(k));
    if (missing.length === 0) return;
    for (const k of missing) askedSet.add(k);
    let cancelled = false;
    (async () => {
      for (let i = 0; i < missing.length; i += 40) {
        const batch = missing.slice(i, i + 40);
        try {
          const result = await load(batch);
          if (cancelled) return;
          if (result.ok) {
            Object.assign(seenMap, result.urls);
            setUrls((prev) => ({ ...prev, ...result.urls }));
          } else for (const k of batch) askedSet.delete(k);
        } catch {
          for (const k of batch) askedSet.delete(k);
        }
      }
    })();
    return () => {
      cancelled = true;
      // a cancelled run leaves its unfinished batches to be asked for again
      for (const k of missing) if (!seenMap[k]) askedSet.delete(k);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys.join("|")]);

  const put = useCallback((key: string, url: string) => {
    asked.current.add(key);
    seen.current[key] = url;
    setUrls((prev) => ({ ...prev, [key]: url }));
  }, []);

  return { urls, put };
}

export function PhotoPoolGallery({
  studentId,
  initialPhotos,
  initialFolders,
  foldersAvailable,
  annotationsAvailable = false,
}: {
  studentId: string;
  initialPhotos: PoolPhoto[];
  initialFolders: PoolFolder[];
  foldersAvailable: boolean;
  // Migration 0140 is in place: the lightbox can rotate / draw and keep the coach's private copy.
  annotationsAvailable?: boolean;
}) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [folders, setFolders] = useState(initialFolders);
  const [filter, setFilter] = useState<PhotoFilter>(NO_FILTER);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState(PAGE);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The paths being dragged right now (empty = no drag in progress).
  const [dragPaths, setDragPaths] = useState<string[]>([]);
  // Lightbox: the editor is open / the student's original is shown instead of the coach's edited copy.
  const [editing, setEditing] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const counts = useMemo(() => folderCounts(photos), [photos]);
  const courses = useMemo(() => courseOptions(photos), [photos]);
  const visible = useMemo(() => filterPhotos(photos, filter), [photos, filter]);
  // Sections: Standard tasks by course, Rutin tasks by type. The gallery order (and the lightbox's previous / next) follows the sections.
  const groups = useMemo(() => groupPhotos(visible), [visible]);
  const ordered = useMemo(() => groups.flatMap((g) => g.photos), [groups]);
  const orderedIndex = useMemo(() => new Map(ordered.map((p, i) => [p.path, i])), [ordered]);
  const pageGroups = takeGroups(groups, shown);
  const page = pageGroups.flatMap((g) => g.photos);
  const lightboxPhoto = lightbox !== null ? ordered[lightbox] : undefined;
  const folderName = useCallback((id: string | null) => folders.find((f) => f.id === id)?.name ?? null, [folders]);

  // An edited photo shows the coach's copy on its card; the student's original is fetched only when nothing is edited (or in the lightbox).
  const originalKeys = [...page.filter((p) => !p.annotatedPath), ...(lightboxPhoto ? [lightboxPhoto] : [])].map((p) => p.path);
  const editedKeys = [...page, ...(lightboxPhoto ? [lightboxPhoto] : [])].flatMap((p) => (p.annotatedPath ? [p.annotatedPath] : []));
  const { urls } = useLazyUrls(originalKeys, (batch) => getPhotoUrls(studentId, batch));
  const { urls: editedUrls, put: putEditedUrl } = useLazyUrls(editedKeys, (batch) => getAnnotationUrls(studentId, batch));

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

  function openPhoto(index: number | null) {
    setLightbox(index);
    setEditing(false);
    setShowOriginal(false);
  }

  async function saveEdit(photo: PoolPhoto, blob: Blob) {
    if (savingEdit) return;
    setSavingEdit(true);
    try {
      const form = new FormData();
      form.set("studentId", studentId);
      form.set("photoPath", photo.path);
      form.set("file", new File([blob], "edit.jpg", { type: "image/jpeg" }));
      const result = await saveAnnotatedPhoto(form);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.url) putEditedUrl(result.annotatedPath, result.url);
      setPhotos((prev) => prev.map((p) => (p.path === photo.path ? { ...p, annotatedPath: result.annotatedPath } : p)));
      setEditing(false);
      setShowOriginal(false);
      toast.success("Düzenlenmiş kopya kaydedildi. Sadece sen görürsün; öğrencinin fotoğrafı değişmedi.");
    } catch (e) {
      toast.error(friendlyError(e, "Düzenlenmiş fotoğraf kaydedilemedi."));
    } finally {
      setSavingEdit(false);
    }
  }

  async function resetEdit(photo: PoolPhoto) {
    if (savingEdit) return;
    if (!window.confirm("Düzenlenmiş kopya silinsin mi? Öğrencinin orijinal fotoğrafı zaten hiç değişmedi, o kalır.")) return;
    setSavingEdit(true);
    try {
      const result = await removePhotoAnnotation(studentId, photo.path);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setPhotos((prev) => prev.map((p) => (p.path === photo.path ? { ...p, annotatedPath: null } : p)));
      setShowOriginal(false);
    } catch (e) {
      toast.error(friendlyError(e, "Düzenlenmiş kopya silinemedi."));
    } finally {
      setSavingEdit(false);
    }
  }

  function toggleGroup(group: { photos: PoolPhoto[] }) {
    setSelected((prev) => {
      const next = new Set(prev);
      const allIn = group.photos.every((p) => next.has(p.path));
      for (const p of group.photos) {
        if (allIn) next.delete(p.path);
        else next.add(p.path);
      }
      return next;
    });
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
            <div className="space-y-6">
              {pageGroups.map((group, gi) => (
                <section key={group.key} aria-label={group.label}>
                  <div className="mb-2 flex items-center gap-2 border-b pb-1.5">
                    <h2 className="text-sm font-semibold">{group.label}</h2>
                    <span className="text-muted-foreground text-xs tabular-nums">{groups[gi].photos.length} fotoğraf</span>
                    <Button type="button" variant="ghost" size="sm" className="ml-auto h-7" onClick={() => toggleGroup(groups[gi])}>
                      {groups[gi].photos.every((p) => selected.has(p.path)) ? "Bölüm seçimini kaldır" : "Bölümü seç"}
                    </Button>
                  </div>
                  <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                    {group.photos.map((photo) => {
                      const index = orderedIndex.get(photo.path) ?? 0;
                      const isSelected = selected.has(photo.path);
                      // A photo the coach has edited shows the edited copy (nothing, until its link arrives, rather than flashing the original).
                      const url = photo.annotatedPath ? editedUrls[photo.annotatedPath] : urls[photo.path];
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
                          <button type="button" className="bg-muted relative block aspect-square w-full" onClick={() => openPhoto(index)} aria-label={`${photo.taskTitle} fotoğrafını büyüt`}>
                            {url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={url} alt={photo.taskTitle} loading="lazy" draggable={false} className="size-full object-cover" />
                            ) : (
                              <span className="text-muted-foreground flex size-full items-center justify-center text-xs">Yükleniyor...</span>
                            )}
                            {photo.annotatedPath && (
                              <span className="bg-primary text-primary-foreground absolute bottom-2 left-2 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium">
                                <Pencil className="size-3" />
                                Düzenlendi
                              </span>
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
                </section>
              ))}
            </div>
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
      <Dialog open={lightbox !== null} onOpenChange={(open) => !open && !savingEdit && openPhoto(null)}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{lightboxPhoto?.taskTitle ?? "Fotoğraf"}</DialogTitle>
            <DialogDescription>
              {lightboxPhoto ? `${lightboxPhoto.courseLabel} · ${formatDate(lightboxPhoto.taskDate)}${lightboxPhoto.folderId ? ` · ${folderName(lightboxPhoto.folderId)}` : ""}` : ""}
            </DialogDescription>
          </DialogHeader>
          {lightboxPhoto &&
            (() => {
              const photo = lightboxPhoto;
              const edited = photo.annotatedPath ? editedUrls[photo.annotatedPath] : undefined;
              const original = urls[photo.path];
              const shownUrl = photo.annotatedPath && !showOriginal ? edited : original;
              if (editing && shownUrl) {
                return <PhotoEditor imageUrl={shownUrl} busy={savingEdit} onSave={(blob) => void saveEdit(photo, blob)} onCancel={() => setEditing(false)} />;
              }
              return (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Button type="button" size="icon" variant="ghost" disabled={lightbox === 0} onClick={() => openPhoto(lightbox === null ? null : Math.max(0, lightbox - 1))} aria-label="Önceki fotoğraf">
                      <ChevronLeft className="size-5" />
                    </Button>
                    <div className="bg-muted flex min-h-60 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-md">
                      {shownUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={shownUrl} alt={photo.taskTitle} className="max-h-[66dvh] w-auto max-w-full object-contain" />
                      ) : (
                        <span className="text-muted-foreground text-sm">Yükleniyor...</span>
                      )}
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      disabled={lightbox === ordered.length - 1}
                      onClick={() => openPhoto(lightbox === null ? null : Math.min(ordered.length - 1, lightbox + 1))}
                      aria-label="Sonraki fotoğraf"
                    >
                      <ChevronRight className="size-5" />
                    </Button>
                  </div>
                  {annotationsAvailable && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" size="sm" onClick={() => setEditing(true)} disabled={!shownUrl || savingEdit}>
                        <Pencil className="size-4" />
                        Düzenle (döndür / çiz)
                      </Button>
                      {photo.annotatedPath && (
                        <>
                          <Button type="button" size="sm" variant="outline" onClick={() => setShowOriginal((v) => !v)}>
                            {showOriginal ? "Düzenlenmiş kopyayı göster" : "Orijinali göster"}
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => void resetEdit(photo)} disabled={savingEdit}>
                            <Undo2 className="size-4" />
                            Orijinale dön
                          </Button>
                          <span className="text-muted-foreground text-xs">{showOriginal ? "Öğrencinin yüklediği orijinal." : "Düzenlenmiş kopya — sadece sana görünür."}</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
