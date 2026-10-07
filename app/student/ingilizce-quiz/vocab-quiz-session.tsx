"use client";

import { useEffect, useState, useTransition } from "react";
import { ArrowLeft, CheckCircle2, Languages, PartyPopper, SkipForward, Sparkles, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  checkVocabAnswer,
  masteryLevel,
  requeueAfterMiss,
  vocabUnitTitle,
  WORD_MASTERY_COUNT,
  type AnswerResult,
  type QuizDirection,
  type QuizWord,
} from "@/lib/lgs-vocab";
import { masteryTierColor } from "@/lib/progress-colors";
import { getActiveVocabQuizTask, getVocabQuizBatch, submitVocabAnswer, type ActiveVocabQuizTask } from "./actions";

type BatchWord = QuizWord & { direction: QuizDirection };

// How long a correct answer's feedback stays up before the same window
// moves on to the next word by itself -- inside the coach's requested
// 750-1000ms window.
const AUTO_ADVANCE_MS = 900;

// countAfter is this word's own correct_count once this answer is accounted for -- set OPTIMISTICALLY the instant the answer is
// given (recordAnswer mirrors nextWordProgress), then reconciled with the server's authoritative value once the background save
// resolves, same spirit as this component's other optimistic state (activeTask.current below).
type Feedback = { result: AnswerResult; correctAnswer: string; wasSkipped: boolean; countAfter: number };

// The per-word mastery indicator: three dots, lit up to the word's level -- 1 correct answer = one dot in the light shade,
// 2 = two dots in the medium shade, 3 or more = all three in the deepest (max mastery). The shade follows the LEVEL, so the
// tier reads at a glance, and it is the same green family as the dashboard's tier bar.
function WordProgressDots({ count, className }: { count: number; className?: string }) {
  const level = masteryLevel(count);
  return (
    <div
      className={cn("flex items-center gap-1.5", className)}
      role="img"
      aria-label={`Kelime seviyesi: ${level}/${WORD_MASTERY_COUNT}`}
    >
      {Array.from({ length: WORD_MASTERY_COUNT }, (_, i) => (
        <span
          key={i}
          // A border on every dot (not just a fill) keeps the shape crisp
          // against a light card regardless of the fill shade -- a pale
          // pastel fill with no outline at all was easy to miss entirely.
          className={cn(
            "size-3 rounded-full border transition-colors duration-300",
            i >= level ? "bg-secondary border-border" : "border-transparent",
          )}
          style={i < level && level > 0 ? { backgroundColor: masteryTierColor(level as 1 | 2 | 3) } : undefined}
        />
      ))}
    </div>
  );
}

function randomDirection(): QuizDirection {
  return Math.random() < 0.5 ? "en_to_tr" : "tr_to_en";
}

function promptFor(word: BatchWord) {
  return word.direction === "tr_to_en"
    ? { promptLabel: "Türkçesi", prompt: word.turkish_meaning, answerLabel: "İngilizcesi", correctAnswer: word.english_word }
    : { promptLabel: "İngilizcesi", prompt: word.english_word, answerLabel: "Türkçesi", correctAnswer: word.turkish_meaning };
}

// Content shown INSIDE the one quiz window once an answer's been given --
// EXACT_MATCH gets no button at all (VocabQuizSession's own effect
// auto-advances it), everything else waits on an explicit "Anladım" so the
// correct answer is actually read, not just flashed past. Replaces the
// word/input/Kontrol Et form in place -- never a second popup on top of it.
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

function AnswerFeedbackContent({
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
    <div className="space-y-4 py-6 text-center">
      <Icon className={cn("mx-auto size-14", content.iconClass)} />
      <WordProgressDots count={feedback.countAfter} className="justify-center" />
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
  );
}

// The one focus-mode window every phase below renders inside -- fixed,
// centered, over a blurred/darkened dashboard that stays mounted (and
// interactive-looking, if not actually reachable) behind it. No
// backdrop-click-to-close: a student mid-answer shouldn't be able to lose
// their place with one stray tap outside the card. Deliberately a
// module-level component, not one redefined inside VocabQuizSession's own
// body: a component defined per-render gets a fresh function identity
// every time, which React treats as a different component type -- every
// single keystroke in the answer Input would have unmounted and
// remounted this whole tree, losing focus (and the browser's own
// autofocus) on every character typed.
function Window({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-md">
      <Card className="max-h-[90vh] w-full max-w-md overflow-y-auto">{children}</Card>
    </div>
  );
}

// One unit's quiz, start to finish, as a single focus-mode window: fetch a
// batch (plus any coach-assigned word-count target still open for this
// unit), ask each word (random direction per word) in a fixed, centered,
// backdrop-blurred overlay over the dashboard -- the blurred/darkened
// units grid stays visible underneath, but only this window is
// interactive. Every state (loading, a word, its feedback, the task-
// complete congrats, the empty/summary screens) swaps content INSIDE that
// same window; "Quizden çık"/"Ünitelere Dön" is the only way to close it
// and return to the crisp dashboard. Rendered by VocabQuizDashboard, which
// keeps the (still-mounted, now-blurred) unit grid behind it.
export function VocabQuizSession({
  unitNumber,
  onExit,
  onWordCorrect,
}: {
  unitNumber: number;
  onExit: () => void;
  // Called after each correct answer is saved, with the word's correct_count before and after -- the dashboard's tier counters.
  onWordCorrect: (previousCount: number, nextCount: number) => void;
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
  // "Kaydediliyor..." hint inside the window, never the feedback itself.
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
  // runs as a transition so it never blocks the window from swapping to
  // the feedback content or the student from clicking through.
  function recordAnswer(result: AnswerResult, correctAnswer: string, wasSkipped: boolean) {
    if (!current) return;
    const isCorrect = result !== "INCORRECT";
    const previousCount = current.correctCount;
    // Optimistic count, mirroring nextWordProgress -- a correct answer adds one, a miss changes nothing -- so the dots already
    // show the right level the instant the answer is given, reconciled below with the server's figure once the save resolves.
    setFeedback({ result, correctAnswer, wasSkipped, countAfter: previousCount + (isCorrect ? 1 : 0) });
    setResults((prev) => [...prev, result]);
    setSubmitError(null);
    // A miss (or Pas Geç), whatever the word had earned before, brings it back later in this same session.
    if (!isCorrect) {
      setBatch((prev) => requeueAfterMiss(prev, index, { ...current, direction: randomDirection() }));
    }

    const wordId = current.id;
    const taskId = activeTask?.id;
    startSaveTransition(async () => {
      try {
        const outcome = await submitVocabAnswer(wordId, isCorrect, taskId);
        if (!outcome.ok) {
          setSubmitError(outcome.error);
          return;
        }
        setFeedback((prev) => (prev ? { ...prev, countAfter: outcome.nextCount } : prev));
        // every copy of this word still waiting in the queue starts from its saved level
        setBatch((prev) => prev.map((w) => (w.id === wordId ? { ...w, correctCount: outcome.nextCount } : w)));
        if (isCorrect) onWordCorrect(previousCount, outcome.nextCount);
        // Keeps the "Görev: X/Y kelime" counter live within this session --
        // a correct answer that actually counted toward the task (one
        // exists, and this answer wasn't just skipped/wrong) bumps it by
        // one, capped at the target the same way the server does.
        if (result !== "INCORRECT") {
          setActiveTask((prev) => (prev ? { ...prev, current: Math.min(prev.current + 1, prev.target) } : prev));
        }
        // Immediately, the moment this answer crosses the assigned task's
        // own target -- overrides the window's own auto-advance/Anladım
        // flow with the congrats content instead.
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

  // Pas Geç: mathematically an incorrect answer (queues the word again for this session, never takes back a correct answer it
  // already earned, never lowers the assigned task's cumulative progress -- see submitVocabAnswer)
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

  // A correct answer's feedback clears itself -- ~900ms to register, then
  // straight to the next word (or the summary screen, via handleNext).
  // Cleared on every dependency change (including a task-completion
  // arriving mid-countdown, which cancels the auto-advance in favor of the
  // congrats content instead) AND on unmount, so a student who exits the
  // instant "Doğru!" appears never triggers a setState on a gone component.
  useEffect(() => {
    if (!feedback || feedback.result !== "EXACT_MATCH" || taskJustCompleted) return;
    const timer = setTimeout(handleNext, AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedback, taskJustCompleted]);


  if (phase === "loading") {
    return (
      <Window>
        <CardContent className="flex min-h-[240px] items-center justify-center">
          <p className="text-muted-foreground text-sm">Kelimeler yükleniyor...</p>
        </CardContent>
      </Window>
    );
  }

  if (phase === "empty") {
    return (
      <Window>
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
      </Window>
    );
  }

  if (phase === "summary") {
    const correctCount = results.filter((r) => r !== "INCORRECT").length;
    return (
      <Window>
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
      </Window>
    );
  }

  if (!current) return null;
  const { promptLabel, prompt, answerLabel } = promptFor(current);

  // The moment this word's answer crossed the assigned task's own target,
  // this REPLACES the normal feedback content -- "immediately", per the
  // coach's own request, not after finishing the rest of whatever batch
  // happened to be loaded.
  if (feedback && taskJustCompleted) {
    return (
      <Window>
        <CardContent className="space-y-4 py-6 text-center">
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
        </CardContent>
      </Window>
    );
  }

  return (
    <Window>
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
        {feedback ? (
          <AnswerFeedbackContent feedback={feedback} isSaving={isSaving} submitError={submitError} onAcknowledge={handleNext} />
        ) : (
          <>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-muted-foreground text-xs">{promptLabel}</p>
                <WordProgressDots count={current.correctCount} />
              </div>
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
                className="text-base"
              />
              <div className="flex gap-2">
                <Button type="submit" className="flex-1" disabled={!answer.trim()}>
                  Kontrol Et
                </Button>
                <Button type="button" variant="outline" onClick={handleSkip}>
                  <SkipForward className="size-4" />
                  Pas Geç
                </Button>
              </div>
            </form>
          </>
        )}

        <button type="button" onClick={onExit} className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline">
          Quizden çık
        </button>
      </CardContent>
    </Window>
  );
}
