"use server";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { dbError } from "@/lib/errors";
import { parseInput } from "@/lib/validation";

export type ScheduleDensity = "compact" | "medium" | "comfortable";

const scheduleDensitySchema = z.enum(["compact", "medium", "comfortable"]);

// Shared by both the coach's and student's own weekly schedule board --
// this is a personal display preference, not panel business logic, so it
// lives here once instead of duplicated 2x (see lib/change-password.ts for
// the same reasoning). Always writes to the CALLER's own profiles row
// (auth.uid()), never anyone else's, so no ownership/role check is needed
// beyond "is logged in" -- there's no cross-account write surface here to
// guard against.
export async function updateScheduleDensity(density: ScheduleDensity) {
  const densityV = parseInput(scheduleDensitySchema, density);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Oturum bulunamadı.");

  const { error } = await supabase.from("profiles").update({ schedule_density: densityV }).eq("id", user.id);
  if (error) throw dbError(error);
}
