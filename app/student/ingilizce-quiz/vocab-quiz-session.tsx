"use client";

import { useEffect, useState, useTransition } from "react";
import { ArrowLeft, CheckCircle2, Languages, PartyPopper, SkipForward, Sparkles, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { checkVocabAnswer, vocabUnitTitle, type AnswerResult, type QuizDirection, type QuizWord } from "@/lib/lgs-vocab";
import { getActiveVocabQuizTask, getVocabQuizBatch, submitVocabAnswer, type ActiveVocabQuizTask } from "./actions";

type BatchWord = QuizWord & { direction: QuizDirection };

// How long the auto-advancing "Doğru!" popup stays up before moving on by
// itself -- inside the coach's requested 750-1000ms window.
const AUTO_ADVANCE_MS = 900;

type Feedback = { result: AnswerResult; correctAnswer: string; wasSkipped: boolean };

function randomDirection(): QuizDirection {
  return Math.random() < 0.5 ? "en_to_tr" : "tr_to_en";
}

function promptFor(word: BatchWord) {
  return word.direction === "tr_to_en"
    ? { promptLabel: "Türkçesi", prompt: word.turkish_meaning, answerLabel: "İngilizcesi", correctAnswer: word.english_word }
    : { promptLabel: "İngilizcesi", prompt: word.english_word, answerLabel: "Türkçesi", correctAnswer: word.turkish_meaning };
}

// The full-screen, Duolingo-style feedback popup content -- EXACT_MATCH
// gets no button at all (VocabQuizSession's own effect auto-advances it),
// everything else waits on an explicit "Anladım" so the correct answer is
// actually read, not just flashed past.
const FEEDBACK_CONTENT: Record<
  AnswerResult,
  { icon: typeof CheckCircle2; iconClass: string; title: (wasSkipped: boolean) => string; titleClass: string }
> = {
  EXACT_MATCH: {
    icon: CheckCircle2,
    iconClass: "text-emerald-500",
    title: () => "Doğru!",
    titleClass: "text-emerald-600",
  },
  ACCEPTED_TYPO: {
    icon: CheckCircle2,
    iconClass: "text-amber-500",
    title: () => "Kabul Edildi!",
    titleClass: "text-amber-600",
  },
  INCORRECT: {
    icon: XCircle,
    iconClass: "text-rose-500",
    title: (wasSkipped) => (wasSkipped ? "Pas Geçildi" : "Yanlış"),
    titleClass: "text-rose-600",
  },
};

// Fixed, centered, blurred-backdrop popup -- replaces what used to be an
// inline colored banner on the card itself. Doesn't render its own
// Dialog/Radix primitive (no close-on-Escape/backdrop-click, no stray X
// button): for EXACT_MATCH there is nothing to dismiss, it closes itself;
// for everything else, "Anladım" is the only way out, on purpose, so the
// correct answer actually gets read before moving on.
function AnswerFeedbackOverlay({
  feedback,
  isSaving,
  submitError,
  onAcknowledge,
}: {
  feedback: Feedback;
  isSaving: boolean;
  submitError: string | null;
  onAcknowledge: () => void;
}) {
  const content = FEEDBACK_CONTENT[feedback.result];
  const Icon = content.icon;
  const needsAcknowledgement = feedback.result !== "EXACT_MATCH";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-md">
      <div className="bg-card w-full max-w-xs space-y-4 rounded-2xl border p-6 text-center shadow-2xl">
        <Icon className={cn("mx-auto size-14", content.iconClass)} />
        <div className="space-y-1.5">
          <p className={cn("text-xl font-bold", content.titleClass)}>{content.title(feedback.wasSkipped)}</p>
          {needsAcknowledgement && (
            <p className="text-foreground text-sm">
              Doğru cevap: <span className="font-semibold">{feedback.correctAnswer}</span>
            </p>
          )}
        </div>

        {isSaving && !submitError && <p className="text-muted-foreground text-xs">Kaydediliyor...</p>}
        {submitError && <p className="text-destructive text-xs">{submitError}</p>}

        {needsAcknowledgement && (
          <Button type="button" className="w-full" size="lg" onClick={onAcknowledge}>
            Anladım
          </Button>
        )}
      </div>
    </div>
  );
}

// One unit's quiz, start to finish: fetch a batch (plus any coach-assigned
// word-count target still open for this unit), ask each word (random
// direction per word), give immediate feedback via a full-screen popup --
// auto-advancing for a correct answer, waiting on "Anladım" for anything
// else -- then a summary screen whose "Çalışmaya Devam Et" fetches the
// next batch in place -- no route change, so it's instant. Lives entirely
// inside VocabQuizDashboard, which swaps this in for the unit grid while
// active.
export function VocabQuizSession({
  unitNumber,
  onExit,
  onWordMastered,
}: {
  unitNumber: number;
  onExit: () => void;
  onWordMastered: () => void;
}) {
  const [phase, setPhase] = useState<"loading" | "quiz" | "summary" | "empty">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [batch, setBatch] = useState<BatchWord[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [results, setResults] = useState<AnswerResult[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<ActiveVocabQuizTask | null>(null);
  const [taskJustCompleted, setTaskJustCompleted] = useState(false);
  // Backs the background save that follows every answer (Kontrol Et/Pas
  // Geç already show feedback synchronously, before this even starts --
  // see recordAnswer) -- isSaving only ever drives a small, non-blocking
  // "Kaydediliyor..." hint inside the popup, never the feedback itself.
  const [isSaving, startSaveTransition] = useTransition();

  async function loadBatch() {
    setPhase("loading");
    setLoadError(null);
    setTaskJustCompleted(false);
    // Both reads always resolve to a result object, never a thrown
    // rejection -- see the comment on GetVocabQuizBatchResult in
    // ./actions.ts for why that matters here specifically. The outer
    // try/catch below is only a backstop for a genuinely unexpected
    // failure (e.g. the network call itself never reaching the server),
    // and deliberately never shows that caught error's own raw message.
    try {
      const [batchResult, taskResult] = await Promise.all([getVocabQuizBatch(unitNumber), getActiveVocabQuizTask(unitNumber)]);
      if (!batchResult.ok) {
        setLoadError(batchResult.error);
        setPhase("empty");
        return;
      }
      // A failed task lookup doesn't block practice -- it just means the
      // "Görev: X/Y kelime" counter won't show for this load; logged for
      // diagnosis, not shown, since the batch itself is otherwise ready.
      setActiveTask(taskResult.ok ? taskResult.task : null);
      if (!taskResult.ok) console.error("[getActiveVocabQuizTask]", taskResult.error);

      if (batchResult.words.length === 0) {
        setPhase("empty");
        return;
      }
      setBatch(batchResult.words.map((w) => ({ ...w, direction: randomDirection() })));
      setIndex(0);
      setAnswer("");
      setFeedback(null);
      setResults([]);
      setSubmitError(null);
      setPhase("quiz");
    } catch {
      setLoadError("Kelimeler yüklenemedi, sayfayı yenileyip tekrar dene.");
      setPhase("empty");
    }
  }

  useEffect(() => {
    // Deferred to a microtask so the fetch (and its own setPhase("loading"))
    // never runs synchronously inside the effect body itself.
    Promise.resolve().then(() => loadBatch());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitNumber]);

  const current = batch[index];

  // Feedback appears the instant this runs -- setFeedback/setResults below
  // are the very first thing that happens, synchronously, before the
  // background save (startSaveTransition) even starts. The save itself
  // runs as a transition so it never blocks the popup from showing or the
  // student from clicking through to the next word.
  function recordAnswer(result: AnswerResult, correctAnswer: string, wasSkipped: boolean) {
    if (!current) return;
    setFeedback({ result, correctAnswer, wasSkipped });
    setResults((prev) => [...prev, result]);
    setSubmitError(null);

    const wordId = current.id;
    const taskId = activeTask?.id;
    startSaveTransition(async () => {
      try {
        const outcome = await submitVocabAnswer(wordId, result !== "INCORRECT", taskId);
        if (!outcome.ok) {
          setSubmitError(outcome.error);
          return;
        }
        if (outcome.isMastered) onWordMastered();
        // Keeps the "Görev: X/Y kelime" counter live within this session --
        // a correct answer that actually counted toward the task (one
        // exists, and this answer wasn't just skipped/wrong) bumps it by
        // one, capped at the target the same way the server does.
        if (result !== "INCORRECT") {
          setActiveTask((prev) => (prev ? { ...prev, current: Math.min(prev.current + 1, prev.target) } : prev));
        }
        // Immediately, the moment this answer crosses the assigned task's
        // own target -- overrides the popup's own auto-advance/Anladım
        // flow below (see the congrats block further down).
        if (outcome.taskCompleted) setTaskJustCompleted(true);
      } catch {
        setSubmitError("İlerleme kaydedilemedi, tekrar dene.");
      }
    });
  }

  function handleSubmitAnswer(e: React.FormEvent) {
    e.preventDefault();
    if (!current || feedback) return;
    const { correctAnswer } = promptFor(current);
    recordAnswer(checkVocabAnswer(answer, correctAnswer, current.direction), correctAnswer, false);
  }

  // Pas Geç: mathematically an incorrect answer (resets the word's streak,
  // never the assigned task's cumulative progress -- see submitVocabAnswer)
  // -- but never silent about it. The correct answer is revealed exactly
  // like a genuine wrong answer, same wait-for-Anladım flow.
  function handleSkip() {
    if (!current || feedback) return;
    const { correctAnswer } = promptFor(current);
    recordAnswer("INCORRECT", correctAnswer, true);
  }

  function handleNext() {
    if (index + 1 >= batch.length) {
      setPhase("summary");
      return;
    }
    setIndex((i) => i + 1);
    setAnswer("");
    setFeedback(null);
    setSubmitError(null);
  }

  // A correct answer's popup closes itself -- ~900ms to register, then
  // straight to the next word (or the summary screen, via handleNext).
  // Cleared on every dependency change (including a task-completion
  // arriving mid-countdown, which cancels the auto-advance in favor of the
  // congrats popup instead) AND on unmount, so a student who exits the
  // instant "Doğru!" appears never triggers a setState on a gone component.
  useEffect(() => {
    if (!feedback || feedback.result !== "EXACT_MATCH" || taskJustCompleted) return;
    const timer = setTimeout(handleNext, AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedback, taskJustCompleted]);

  if (phase === "loading") {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <p className="text-muted-foreground text-sm">Kelimeler yükleniyor...</p>
      </div>
    );
  }

  if (phase === "empty") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{vocabUnitTitle(unitNumber)}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadError ? (
            <p className="text-destructive text-sm">{loadError}</p>
          ) : (
            <div className="flex items-center gap-2 text-sm text-emerald-700">
              <PartyPopper className="size-4 shrink-0" />
              Bu ünitedeki tüm kelimeleri öğrendin! Tekrar etmek istersen daha sonra tekrar dene.
            </div>
          )}
          <div className="flex gap-2">
            {loadError && (
              <Button type="button" variant="outline" onClick={loadBatch}>
                Tekrar Dene
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onExit}>
              <ArrowLeft className="size-4" />
              Ünitelere Dön
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (phase === "summary") {
    const correctCount = results.filter((r) => r !== "INCORRECT").length;
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{vocabUnitTitle(unitNumber)} -- Tur Tamamlandı</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-foreground text-sm">
            {results.length} kelimeden <span className="font-semibold text-emerald-700">{correctCount}</span> tanesini
            doğru bildin.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={loadBatch}>
              Çalışmaya Devam Et
            </Button>
            <Button type="button" variant="outline" onClick={onExit}>
              <ArrowLeft className="size-4" />
              Ünitelere Dön
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!current) return null;
  const { promptLabel, prompt, answerLabel } = promptFor(current);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <CardTitle className="flex items-center gap-1.5 text-base leading-snug">
            <Languages className="text-primary size-4 shrink-0" />
            {vocabUnitTitle(unitNumber)}
          </CardTitle>
          <div className="flex shrink-0 items-center gap-3 text-xs">
            {activeTask && (
              <span className="text-muted-foreground tabular-nums">
                Görev: {activeTask.current}/{activeTask.target} kelime
              </span>
            )}
            <span className="text-muted-foreground tabular-nums">
              Kelime {index + 1}/{batch.length}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs">{promptLabel}</p>
            <p className="text-foreground text-2xl font-semibold">{prompt}</p>
          </div>

          <form onSubmit={handleSubmitAnswer} className="space-y-2">
            <label htmlFor="vocab-answer" className="text-muted-foreground text-xs">
              {answerLabel}
            </label>
            <Input
              id="vocab-answer"
              autoFocus
              autoComplete="off"
              autoCapitalize="off"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              disabled={!!feedback}
              className="text-base"
            />
            {!feedback && (
              <div className="flex gap-2">
                <Button type="submit" className="flex-1" disabled={!answer.trim()}>
                  Kontrol Et
                </Button>
                <Button type="button" variant="outline" onClick={handleSkip}>
                  <SkipForward className="size-4" />
                  Pas Geç
                </Button>
              </div>
            )}
          </form>

          <button type="button" onClick={onExit} className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline">
            Quizden çık
          </button>
        </CardContent>
      </Card>

      {/* The moment this word's answer crossed the assigned task's own
          target, this REPLACES the normal feedback popup -- "immediately",
          per the coach's own request, not after finishing the rest of
          whatever batch happened to be loaded. */}
      {feedback && taskJustCompleted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-md">
          <div className="bg-card w-full max-w-xs space-y-4 rounded-2xl border border-amber-400/50 p-6 text-center shadow-2xl">
            <Sparkles className="mx-auto size-14 text-amber-500" />
            <p className="text-sm text-amber-800">
              Bugün atanan görevlerini tamamladın, tebrikler! 🌟 İstersen çalışmaya devam edebilirsin.
            </p>
            <div className="flex flex-col gap-2">
              <Button type="button" onClick={loadBatch}>
                Çalışmaya Devam Et
              </Button>
              <Button type="button" variant="outline" onClick={onExit}>
                <ArrowLeft className="size-4" />
                Ünitelere Dön
              </Button>
            </div>
          </div>
        </div>
      )}

      {feedback && !taskJustCompleted && (
        <AnswerFeedbackOverlay feedback={feedback} isSaving={isSaving} submitError={submitError} onAcknowledge={handleNext} />
      )}
    </>
  );
}
