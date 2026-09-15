"use server";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { dbError } from "@/lib/errors";
import { parseInput } from "@/lib/validation";

// Shared by both the coach's and student's own weekly schedule board --
// this is a personal display preference, not panel business logic, so it
// lives here once instead of duplicated 2x (see lib/change-password.ts for
// the same reasoning). Always writes to the CALLER's own profiles row
// (auth.uid()), never anyone else's, so no ownership/role check is needed
// beyond "is logged in."
//
// Each row-resize-end sends the WHOLE current array for its lane, not
// just the changed index -- Postgres arrays have no convenient single-
// element update through the JS client, and the array is small (bounded
// by however many routines/tasks a day actually has), so this is cheap.
// The upper bound (2000px) is a basic input-sanity ceiling, not a UX max
// -- the drag handles themselves never clamp upward. The lower bound
// mirrors the DB check constraints (migration 0076); each panel's own
// drag handler enforces a tighter, panel-specific minimum before a value
// ever reaches here. 200 elements is far more rows than any real day
// column will ever have -- just a sanity cap against a malformed client.
const rowHeightsSchema = z.array(z.number().int().min(56).max(2000)).max(200);

export async function updateScheduleRoutineRowHeights(heights: number[]) {
  const heightsV = parseInput(rowHeightsSchema, heights);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Oturum bulunamadı.");

  const { error } = await supabase.from("profiles").update({ schedule_routine_row_heights_px: heightsV }).eq("id", user.id);
  if (error) throw dbError(error);
}

export async function updateScheduleTaskRowHeights(heights: number[]) {
  const heightsV = parseInput(rowHeightsSchema, heights);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Oturum bulunamadı.");

  const { error } = await supabase.from("profiles").update({ schedule_task_row_heights_px: heightsV }).eq("id", user.id);
  if (error) throw dbError(error);
}
