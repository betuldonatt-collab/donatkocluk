"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type SaveEntryInput = {
  entryDate: string;
  paragraf: { dogru: number; yanlis: number; bos: number; sure: number };
  problem: { dogru: number; yanlis: number; bos: number; sure: number };
};

export async function saveParagrafProblemEntry(input: SaveEntryInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Oturum bulunamadı.");

  const { error } = await supabase.from("paragraf_problem_entries").insert({
    student_id: user.id,
    entry_date: input.entryDate,
    paragraf_dogru: input.paragraf.dogru,
    paragraf_yanlis: input.paragraf.yanlis,
    paragraf_bos: input.paragraf.bos,
    paragraf_sure: input.paragraf.sure,
    problem_dogru: input.problem.dogru,
    problem_yanlis: input.problem.yanlis,
    problem_bos: input.problem.bos,
    problem_sure: input.problem.sure,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/student/paragraf-problem");
}
