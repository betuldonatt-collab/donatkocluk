"use client";

import { useState } from "react";
import Link from "next/link";
import { Languages } from "lucide-react";
import { toast } from "sonner";

import { friendlyError } from "@/lib/friendly-error";
import { vocabQuizHref, vocabTaskUnit } from "@/lib/vocab-quiz-task";
import { cn } from "@/lib/utils";
import { markVocabQuizNotDone } from "../../ingilizce-quiz/actions";
import type { StudentTask } from "./types";

// The two things a student does with an assigned İngilizce Kelime Quizi, right on its card (and in its modal):
//   * "Quize Başla"  -- opens that unit's quiz, tied to THIS task so its answers count for it.
//   * "Yapılmadı"    -- the one manual status: "I am not doing this", without starting the quiz.
// Yapıldı and Yarım Yapıldı are never the student's to pick: the quiz sets them (lib/vocab-quiz-task.ts). Nothing here for a finished
// task or a locked week.
export function VocabQuizActions({
  task,
  onStatusChange,
  className,
}: {
  task: StudentTask;
  onStatusChange?: (taskId: string, patch: Partial<StudentTask>) => void;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  if (task.task_type !== "vocab_quiz" || task.week_locked || task.status === "done" || task.completed) return null;
  const notDone = task.status === "not_done";

  async function markNotDone() {
    if (busy || notDone) return;
    setBusy(true);
    try {
      const result = await markVocabQuizNotDone(task.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      onStatusChange?.(task.id, { status: "not_done", completed: false });
    } catch (e) {
      toast.error(friendlyError(e, "Görev durumu kaydedilemedi."));
    } finally {
      setBusy(false);
    }
  }

  // Sits inside the clickable card: its own clicks / key presses must not also open the task's modal.
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)} onClick={stop} onKeyDown={stop}>
      <Link
        href={vocabQuizHref(vocabTaskUnit(task.topic_id), task.id)}
        className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors"
      >
        <Languages className="size-4" />
        Quize Başla
      </Link>
      <button
        type="button"
        onClick={() => void markNotDone()}
        disabled={busy}
        aria-pressed={notDone}
        className={cn(
          "inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium transition-colors disabled:opacity-60",
          notDone ? "border-rose-400 bg-rose-500/10 text-rose-700" : "border-border bg-background hover:bg-accent text-foreground",
        )}
      >
        Yapılmadı
      </button>
    </div>
  );
}
