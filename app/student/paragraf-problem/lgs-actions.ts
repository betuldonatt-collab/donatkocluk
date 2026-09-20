"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { assertNotImpersonating } from "@/lib/impersonation";
import { GENERIC_DB_ERROR, dbError } from "@/lib/errors";
import { parseInput } from "@/lib/validation";
import { PARAGRAF_ENTRIES_PAGE_SIZE } from "./constants";
import { mapLgsRow, type LgsRoutineRow } from "./lgs-mapper";
import type { LgsHistoryEntry } from "./lgs-types";

// The two saves RETURN their outcome instead of throwing: a thrown message is
// stripped to a generic one in production builds (see the note in
// app/student/kaynak-takibi/actions.ts).
type SaveResult = { ok: true } | { ok: false; error: string };

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Geçersiz tarih.");

const paragrafSchema = z.object({
  entryDate: dateSchema,
  dogru: z.number("Doğru sayısı geçersiz.").int("Doğru sayısı tam sayı olmalı.").min(0, "Doğru sayısı negatif olamaz.").max(1000, "Doğru sayısı çok büyük."),
  yanlis: z.number("Yanlış sayısı geçersiz.").int("Yanlış sayısı tam sayı olmalı.").min(0, "Yanlış sayısı negatif olamaz.").max(1000, "Yanlış sayısı çok büyük."),
  bos: z.number("Boş sayısı geçersiz.").int("Boş sayısı tam sayı olmalı.").min(0, "Boş sayısı negatif olamaz.").max(1000, "Boş sayısı çok büyük."),
  sure: z.number("Süre geçersiz.").int("Süre tam sayı olmalı.").min(0, "Süre negatif olamaz.").max(1440, "Süre en fazla 1440 dakika olabilir.").nullable(),
});

const kitapSchema = z.object({
  entryDate: dateSchema,
  pages: z.number("Sayfa sayısı geçersiz.").int("Sayfa sayısı tam sayı olmalı.").min(0, "Sayfa sayısı negatif olamaz.").max(5000, "Sayfa sayısı en fazla 5000 olabilir."),
  title: z.string().trim().max(200).nullable(),
  author: z.string().trim().max(200).nullable(),
});

async function requireUserId() {
  await assertNotImpersonating();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Oturum bulunamadı.");
  return { supabase, userId: user.id };
}

// Each save touches ONLY its own half of the day's row (a partial upsert
// leaves the other columns as they were), so logging Paragraf in the
// morning and Kitap Okuma in the evening never clobber each other. A second
// Paragraf save for the same day replaces that day's Paragraf -- there is
// one Paragraf session per day.
export async function saveLgsParagraf(input: z.input<typeof paragrafSchema>): Promise<SaveResult> {
  try {
    const v = parseInput(paragrafSchema, input);
    const { supabase, userId } = await requireUserId();
    const { error } = await supabase.from("lgs_daily_routines").upsert(
      {
        student_id: userId,
        entry_date: v.entryDate,
        paragraf_correct: v.dogru,
        paragraf_wrong: v.yanlis,
        paragraf_empty: v.bos,
        paragraf_duration_minutes: v.sure,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "student_id,entry_date" },
    );
    if (error) throw dbError(error);
    revalidatePath("/student/paragraf-problem");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : GENERIC_DB_ERROR };
  }
}

export async function saveLgsKitap(input: z.input<typeof kitapSchema>): Promise<SaveResult> {
  try {
    const v = parseInput(kitapSchema, input);
    const { supabase, userId } = await requireUserId();
    const { error } = await supabase.from("lgs_daily_routines").upsert(
      {
        student_id: userId,
        entry_date: v.entryDate,
        book_pages_read: v.pages,
        book_title: v.title || null,
        book_author: v.author || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "student_id,entry_date" },
    );
    if (error) throw dbError(error);
    revalidatePath("/student/paragraf-problem");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : GENERIC_DB_ERROR };
  }
}

export async function getMoreLgsEntries(offset: number): Promise<LgsHistoryEntry[]> {
  const { supabase, userId } = await requireUserIdReadOnly();
  const { data, error } = await supabase
    .from("lgs_daily_routines")
    .select("*")
    .eq("student_id", userId)
    .order("entry_date", { ascending: false })
    .range(offset, offset + PARAGRAF_ENTRIES_PAGE_SIZE - 1);
  if (error) throw dbError(error);
  return ((data ?? []) as LgsRoutineRow[]).map(mapLgsRow);
}

export async function getLgsEntriesForDateRange(startDate: string, endDate: string): Promise<LgsHistoryEntry[]> {
  const range = parseInput(
    z
      .object({ startDate: dateSchema, endDate: dateSchema })
      .refine((r) => r.startDate <= r.endDate, { message: "Başlangıç tarihi bitiş tarihinden sonra olamaz." }),
    { startDate, endDate },
  );
  const { supabase, userId } = await requireUserIdReadOnly();
  const { data, error } = await supabase
    .from("lgs_daily_routines")
    .select("*")
    .eq("student_id", userId)
    .gte("entry_date", range.startDate)
    .lte("entry_date", range.endDate)
    .order("entry_date", { ascending: true });
  if (error) throw dbError(error);
  return ((data ?? []) as LgsRoutineRow[]).map(mapLgsRow);
}

async function requireUserIdReadOnly() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Oturum bulunamadı.");
  return { supabase, userId: user.id };
}
