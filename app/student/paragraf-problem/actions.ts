"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { assertNotImpersonating } from "@/lib/impersonation";
import { dbError } from "@/lib/errors";
import { parseInput } from "@/lib/validation";
import { computeNet } from "@/lib/scoring";
import { PARAGRAF_ENTRIES_PAGE_SIZE } from "./constants";
import type { HistoryEntry } from "./paragraf-problem-client";

export type SaveEntryInput = {
  entryDate: string;
  paragraf: { dogru: number; yanlis: number; bos: number; sure: number };
  problem: { dogru: number; yanlis: number; bos: number; sure: number };
};

const countsSchema = z.object({
  dogru: z.number().int().min(0),
  yanlis: z.number().int().min(0),
  bos: z.number().int().min(0),
  sure: z.number().int().min(0),
});

const saveEntrySchema = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Geçersiz tarih."),
  paragraf: countsSchema,
  problem: countsSchema,
});

export async function saveParagrafProblemEntry(input: SaveEntryInput) {
  await assertNotImpersonating();
  const inputV = parseInput(saveEntrySchema, input);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Oturum bulunamadı.");

  const { error } = await supabase.from("paragraf_problem_entries").insert({
    student_id: user.id,
    entry_date: inputV.entryDate,
    paragraf_dogru: inputV.paragraf.dogru,
    paragraf_yanlis: inputV.paragraf.yanlis,
    paragraf_bos: inputV.paragraf.bos,
    paragraf_sure: inputV.paragraf.sure,
    problem_dogru: inputV.problem.dogru,
    problem_yanlis: inputV.problem.yanlis,
    problem_bos: inputV.problem.bos,
    problem_sure: inputV.problem.sure,
  });

  if (error) throw dbError(error);

  revalidatePath("/student/paragraf-problem");
}

// "Daha Fazla Yükle" below the history tables -- the initial page.tsx load
// only fetches the most recent PARAGRAF_ENTRIES_PAGE_SIZE entries.
export async function getMoreParagrafEntries(offset: number): Promise<HistoryEntry[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Oturum bulunamadı.");

  const { data: rows, error } = await supabase
    .from("paragraf_problem_entries")
    .select("*")
    .eq("student_id", user.id)
    .order("entry_date", { ascending: false })
    .range(offset, offset + PARAGRAF_ENTRIES_PAGE_SIZE - 1);
  if (error) throw dbError(error);

  return (rows ?? []).map(mapEntryRow);
}

const dateRangeSchema = z
  .object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Geçersiz tarih."),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Geçersiz tarih."),
  })
  .refine((v) => v.startDate <= v.endDate, { message: "Başlangıç tarihi bitiş tarihinden sonra olamaz." });

// Backs the chart's calendar range picker -- a picked range can fall
// outside the paginated history table's currently-loaded window
// (PARAGRAF_ENTRIES_PAGE_SIZE most recent rows), so the chart fetches that
// range's rows directly rather than paging through getMoreParagrafEntries
// until it happens to reach it.
export async function getParagrafEntriesForDateRange(startDate: string, endDate: string): Promise<HistoryEntry[]> {
  const { startDate: startDateV, endDate: endDateV } = parseInput(dateRangeSchema, { startDate, endDate });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Oturum bulunamadı.");

  const { data: rows, error } = await supabase
    .from("paragraf_problem_entries")
    .select("*")
    .eq("student_id", user.id)
    .gte("entry_date", startDateV)
    .lte("entry_date", endDateV)
    .order("entry_date", { ascending: true });
  if (error) throw dbError(error);

  return (rows ?? []).map(mapEntryRow);
}

function mapEntryRow(r: {
  id: string;
  entry_date: string;
  paragraf_dogru: number;
  paragraf_yanlis: number;
  paragraf_bos: number;
  paragraf_sure: number;
  problem_dogru: number;
  problem_yanlis: number;
  problem_bos: number;
  problem_sure: number;
}): HistoryEntry {
  return {
    id: r.id,
    date: r.entry_date,
    paragraf: {
      dogru: r.paragraf_dogru,
      yanlis: r.paragraf_yanlis,
      bos: r.paragraf_bos,
      sure: r.paragraf_sure,
      net: computeNet(r.paragraf_dogru, r.paragraf_yanlis),
    },
    problem: {
      dogru: r.problem_dogru,
      yanlis: r.problem_yanlis,
      bos: r.problem_bos,
      sure: r.problem_sure,
      net: computeNet(r.problem_dogru, r.problem_yanlis),
    },
  };
}
