"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, PartyPopper, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { checkVocabAnswer, type AnswerResult, type QuizDirection, type QuizWord } from "@/lib/lgs-vocab";
import { getVocabQuizBatch, submitVocabAnswer } from "./actions";

type BatchWord = QuizWord & { direction: QuizDirection };

function randomDirection(): QuizDirection {
  return Math.random() < 0.5 ? "en_to_tr" : "tr_to_en";
}

function promptFor(word: BatchWord) {
  return word.direction === "tr_to_en"
    ? { promptLabel: "Türkçesi", prompt: word.turkish_meaning, answerLabel: "İngilizcesi", correctAnswer: word.english_word }
    : { promptLabel: "İngilizcesi", prompt: word.english_word, answerLabel: "Türkçesi", correctAnswer: word.turkish_meaning };
}

const FEEDBACK_STYLES: Record<AnswerResult, { banner: string; Icon: typeof CheckCircle2; label: (correctAnswer: string) => string }> = {
  EXACT_MATCH: {
    banner: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700",
    Icon: CheckCircle2,
    label: () => "Doğru!",
  },
  ACCEPTED_TYPO: {
    banner: "border-amber-500/40 bg-amber-500/10 text-amber-700",
    Icon: CheckCircle2,
    label: (correctAnswer) => `Kabul edildi! Doğru yazılışı: ${correctAnswer}`,
  },
  INCORRECT: {
    banner: "border-rose-500/40 bg-rose-500/10 text-rose-700",
    Icon: XCircle,
    label: (correctAnswer) => `Yanlış. Doğru cevap: ${correctAnswer}`,
  },
};

// One unit's quiz, start to finish: fetch a batch, ask each word (random
// direction per word), give immediate feedback, then a summary screen
// whose "Çalışmaya Devam Et" fetches the next batch in place -- no route
// change, so it's instant. Lives entirely inside VocabQuizDashboard, which
// swaps this in for the unit grid while active.
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
  const [feedback, setFeedback] = useState<{ result: AnswerResult; correctAnswer: string } | null>(null);
  const [results, setResults] = useState<AnswerResult[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function loadBatch() {
    setPhase("loading");
    setLoadError(null);
    try {
      const words = await getVocabQuizBatch(unitNumber);
      if (words.length === 0) {
        setPhase("empty");
        return;
      }
      setBatch(words.map((w) => ({ ...w, direction: randomDirection() })));
      setIndex(0);
      setAnswer("");
      setFeedback(null);
      setResults([]);
      setSubmitError(null);
      setPhase("quiz");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Kelimeler yüklenemedi, tekrar dene.");
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

  async function handleSubmitAnswer(e: React.FormEvent) {
    e.preventDefault();
    if (!current || feedback || submitting) return;
    const { correctAnswer } = promptFor(current);
    const result = checkVocabAnswer(answer, correctAnswer, current.direction);
    setFeedback({ result, correctAnswer });
    setResults((prev) => [...prev, result]);

    setSubmitting(true);
    setSubmitError(null);
    try {
      const outcome = await submitVocabAnswer(current.id, result !== "INCORRECT");
      if (!outcome.ok) {
        setSubmitError(outcome.error);
      } else if (outcome.isMastered) {
        onWordMastered();
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "İlerleme kaydedilemedi, tekrar dene.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleNext() {
    if (index + 1 >= batch.length) {
      setPhase("summary");
      return;
    }
    setIndex((i) => i + 1);
    setAnswer("");
    setFeedback(null);
  }

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
          <CardTitle className="text-base">{unitNumber}. Ünite</CardTitle>
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
          <CardTitle className="text-base">{unitNumber}. Ünite -- Tur Tamamlandı</CardTitle>
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
  const { promptLabel, prompt, answerLabel, correctAnswer } = promptFor(current);
  const feedbackStyle = feedback ? FEEDBACK_STYLES[feedback.result] : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{unitNumber}. Ünite</CardTitle>
        <span className="text-muted-foreground text-xs tabular-nums">
          Kelime {index + 1}/{batch.length}
        </span>
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
            <Button type="submit" className="w-full" disabled={!answer.trim()}>
              Kontrol Et
            </Button>
          )}
        </form>

        {feedbackStyle && (
          <div className={cn("flex items-center gap-2 rounded-md border px-3 py-2 text-sm", feedbackStyle.banner)}>
            <feedbackStyle.Icon className="size-4 shrink-0" />
            {feedbackStyle.label(correctAnswer)}
          </div>
        )}

        {submitError && <p className="text-destructive text-xs">{submitError}</p>}

        {feedback && (
          <Button type="button" className="w-full" onClick={handleNext}>
            {index + 1 >= batch.length ? "Turu Bitir" : "Sonraki Kelime"}
          </Button>
        )}

        <button type="button" onClick={onExit} className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline">
          Quizden çık
        </button>
      </CardContent>
    </Card>
  );
}
