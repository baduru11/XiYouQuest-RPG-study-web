"use client";

import { useState, useCallback, useEffect } from "react";
import { CharacterDisplay } from "@/components/character/character-display";
import { DialogueBox } from "@/components/character/dialogue-box";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { calculateXP } from "@/lib/gamification/xp";
import type { ExpressionName } from "@/types/character";
import type { QuizQuestion, QuestionResult } from "@/types/practice";

interface QuizSessionProps {
  questions: QuizQuestion[];
  character: {
    name: string;
    personalityPrompt: string;
    expressions: Record<string, string>;
  };
  characterId?: string;
  component: 1 | 2 | 3 | 4 | 5;
}

type SessionPhase = "answering" | "result" | "complete";

export function QuizSession({ questions, character, characterId, component }: QuizSessionProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [phase, setPhase] = useState<SessionPhase>("answering");
  const [expression, setExpression] = useState<ExpressionName>("neutral");
  const [dialogue, setDialogue] = useState("Let's test your Putonghua knowledge! Pick the best answer.");
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);
  const [totalXPEarned, setTotalXPEarned] = useState(0);
  const [results, setResults] = useState<QuestionResult[]>([]);
  const [isLoadingFeedback, setIsLoadingFeedback] = useState(false);

  const currentQuestion = questions[currentIndex];
  const progressPercent = questions.length > 0 ? Math.round((currentIndex / questions.length) * 100) : 0;

  // Save progress when quiz completes
  useEffect(() => {
    if (phase !== "complete" || !characterId) return;

    const saveProgress = async () => {
      const totalQuestions = results.length;
      const correctCount = results.filter(r => r.isCorrect).length;
      const accuracy = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

      try {
        await fetch("/api/progress/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            characterId,
            component,
            score: accuracy,
            xpEarned: totalXPEarned,
            durationSeconds: 0,
            questionsAttempted: totalQuestions,
            questionsCorrect: correctCount,
            bestStreak: streak,
          }),
        });
      } catch (err) {
        console.error("Failed to save progress:", err);
      }
    };

    saveProgress();
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAnswer = useCallback(async (answerIndex: number) => {
    if (phase !== "answering") return;

    setSelectedAnswer(answerIndex);
    setPhase("result");

    const isCorrect = answerIndex === currentQuestion.correctIndex;

    // Calculate XP
    const newStreak = isCorrect ? streak + 1 : 0;
    setStreak(newStreak);

    const xpResult = calculateXP({
      isCorrect,
      currentStreak: newStreak,
    });
    setTotalXPEarned((prev) => prev + xpResult.totalXP);

    // Set character reaction
    if (isCorrect) {
      setExpression(newStreak >= 3 ? "proud" : "happy");
      setDialogue(
        newStreak >= 3
          ? `${newStreak} in a row! You really know your stuff!`
          : `Correct! ${currentQuestion.explanation}`
      );
    } else {
      setExpression("encouraging");
      setDialogue(currentQuestion.explanation);

      // For wrong answers, get AI feedback
      setIsLoadingFeedback(true);
      try {
        const feedbackResponse = await fetch("/api/ai/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            characterPrompt: character.personalityPrompt,
            component: 3,
            questionText: currentQuestion.prompt + " " + currentQuestion.options.join(" / "),
            userAnswer: currentQuestion.options[answerIndex],
            isCorrect: false,
          }),
        });

        if (feedbackResponse.ok) {
          const feedbackData = await feedbackResponse.json();
          setDialogue(feedbackData.feedback);
        }
      } catch {
        // Keep the default explanation if AI feedback fails
      } finally {
        setIsLoadingFeedback(false);
      }
    }

    // Store result
    setResults((prev) => [
      ...prev,
      {
        questionText: `${currentQuestion.prompt} [${currentQuestion.options.join(" / ")}]`,
        userAnswer: currentQuestion.options[answerIndex],
        isCorrect,
        pronunciationScore: null,
        feedback: currentQuestion.explanation,
        xpEarned: xpResult.totalXP,
      },
    ]);
  }, [phase, currentQuestion, streak, character.personalityPrompt]);

  const handleNext = useCallback(() => {
    if (currentIndex + 1 >= questions.length) {
      setPhase("complete");
      setExpression("proud");
      setDialogue("Great job completing the quiz! Let's review your results.");
    } else {
      setCurrentIndex((prev) => prev + 1);
      setPhase("answering");
      setSelectedAnswer(null);
      setExpression("neutral");
      setDialogue("Next question! Think carefully before you answer.");
    }
  }, [currentIndex, questions.length]);

  // Get label for question type
  function getTypeLabel(type: QuizQuestion["type"]): string {
    switch (type) {
      case "word-choice":
        return "Word Choice";
      case "measure-word":
        return "Measure Word";
      case "sentence-order":
        return "Sentence Order";
      default:
        return "Question";
    }
  }

  // Get button style based on answer state
  function getOptionStyle(index: number): string {
    if (phase !== "result") {
      return "border-2 border-border hover:border-primary hover:bg-accent/50 transition-all hover:shadow-sm";
    }

    if (index === currentQuestion.correctIndex) {
      return "border-2 border-green-500 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 animate-in fade-in duration-300";
    }

    if (index === selectedAnswer && index !== currentQuestion.correctIndex) {
      return "border-2 border-red-500 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300";
    }

    return "border-2 border-border opacity-50";
  }

  // Completion screen
  if (phase === "complete") {
    const totalQuestions = results.length;
    const correctCount = results.filter((r) => r.isCorrect).length;
    const accuracy = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

    // Count by type
    const wordChoiceResults = results.filter((_, i) => questions[i]?.type === "word-choice");
    const measureWordResults = results.filter((_, i) => questions[i]?.type === "measure-word");
    const sentenceOrderResults = results.filter((_, i) => questions[i]?.type === "sentence-order");

    const wordChoiceCorrect = wordChoiceResults.filter((r) => r.isCorrect).length;
    const measureWordCorrect = measureWordResults.filter((r) => r.isCorrect).length;
    const sentenceOrderCorrect = sentenceOrderResults.filter((r) => r.isCorrect).length;

    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center gap-4">
          <CharacterDisplay
            characterName={character.name}
            expressionImages={character.expressions}
            currentExpression="proud"
          />
          <DialogueBox
            text={dialogue}
            characterName={character.name}
          />
        </div>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <h2 className="text-xl font-bold text-center">Quiz Complete!</h2>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="text-center">
                <p className="text-3xl font-bold">{totalQuestions}</p>
                <p className="text-sm text-muted-foreground">Questions</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-green-600">{correctCount}</p>
                <p className="text-sm text-muted-foreground">Correct</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold">{accuracy}%</p>
                <p className="text-sm text-muted-foreground">Accuracy</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-yellow-600">+{totalXPEarned}</p>
                <p className="text-sm text-muted-foreground">XP Earned</p>
              </div>
            </div>

            <Progress value={accuracy} className="h-3" />

            {/* Breakdown by type */}
            <div className="grid grid-cols-3 gap-3 text-center text-sm">
              <div className="rounded-md border p-2">
                <p className="font-medium">Word Choice</p>
                <p className="text-muted-foreground">
                  {wordChoiceCorrect}/{wordChoiceResults.length}
                </p>
              </div>
              <div className="rounded-md border p-2">
                <p className="font-medium">Measure Words</p>
                <p className="text-muted-foreground">
                  {measureWordCorrect}/{measureWordResults.length}
                </p>
              </div>
              <div className="rounded-md border p-2">
                <p className="font-medium">Sentence Order</p>
                <p className="text-muted-foreground">
                  {sentenceOrderCorrect}/{sentenceOrderResults.length}
                </p>
              </div>
            </div>

            {/* Individual results */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {results.map((result, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between rounded-md border p-2"
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium truncate block">
                      Q{index + 1}: {questions[index]?.prompt}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Your answer: {result.userAnswer}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    <Badge variant={result.isCorrect ? "default" : "destructive"}>
                      {result.isCorrect ? "Correct" : "Wrong"}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      +{result.xpEarned} XP
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3 justify-center pt-2">
              <Button onClick={() => window.location.reload()}>
                Try Again
              </Button>
              <Button variant="outline" asChild>
                <a href="/dashboard">Back to Dashboard</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Main quiz UI
  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>
            Question {currentIndex + 1} of {questions.length}
          </span>
          <span className="flex items-center gap-2">
            {streak > 0 && (
              <Badge variant="secondary">
                Streak: {streak}
              </Badge>
            )}
            <Badge variant="outline">+{totalXPEarned} XP</Badge>
          </span>
        </div>
        <Progress value={progressPercent} className="h-2" />
      </div>

      {/* Main content area */}
      <div className="flex flex-col gap-4 md:flex-row">
        {/* Left side: Character (30%) */}
        <div className="space-y-3 md:w-[30%]">
          <CharacterDisplay
            characterName={character.name}
            expressionImages={character.expressions}
            currentExpression={expression}
          />
          <DialogueBox
            text={dialogue}
            characterName={character.name}
          />
        </div>

        {/* Right side: Quiz area (70%) */}
        <div className="flex-1 md:w-[70%]">
          <Card className="h-full">
            <CardContent className="flex flex-col gap-6 py-8">
              {/* Question type badge */}
              <div className="flex items-center gap-2">
                <Badge variant="outline">{getTypeLabel(currentQuestion.type)}</Badge>
                {isLoadingFeedback && (
                  <span className="text-xs text-muted-foreground">Getting explanation...</span>
                )}
              </div>

              {/* Question prompt */}
              <div className="text-center">
                {currentQuestion.type === "measure-word" ? (
                  <p className="text-3xl font-bold font-chinese sm:text-4xl">
                    {currentQuestion.prompt}
                  </p>
                ) : (
                  <p className="text-xl font-medium font-chinese sm:text-2xl">
                    {currentQuestion.prompt}
                  </p>
                )}
              </div>

              {/* Answer options */}
              <div className={`grid gap-3 ${
                currentQuestion.type === "measure-word"
                  ? "grid-cols-2 sm:grid-cols-4"
                  : "grid-cols-1"
              }`}>
                {currentQuestion.options.map((option, index) => (
                  <button
                    key={index}
                    onClick={() => handleAnswer(index)}
                    disabled={phase === "result"}
                    className={`rounded-lg p-4 text-left transition-all ${getOptionStyle(index)} ${
                      phase === "answering" ? "cursor-pointer" : "cursor-default"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold">
                        {String.fromCharCode(65 + index)}
                      </span>
                      <span className={`font-medium font-chinese ${
                        currentQuestion.type === "measure-word" ? "text-2xl" : "text-lg"
                      }`}>
                        {option}
                      </span>
                    </div>

                    {/* Show correct/incorrect indicators */}
                    {phase === "result" && index === currentQuestion.correctIndex && (
                      <span className="mt-2 block text-xs font-medium text-green-600">
                        Correct answer
                      </span>
                    )}
                    {phase === "result" && index === selectedAnswer && index !== currentQuestion.correctIndex && (
                      <span className="mt-2 block text-xs font-medium text-red-600">
                        Your answer
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Explanation after answering */}
              {phase === "result" && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300 rounded-lg border bg-muted/50 p-4">
                  <p className="text-sm font-medium mb-1">Explanation:</p>
                  <p className="text-sm text-muted-foreground">
                    {currentQuestion.explanation}
                  </p>
                </div>
              )}

              {/* Next button */}
              {phase === "result" && (
                <div className="flex justify-center">
                  <Button onClick={handleNext} size="lg">
                    {currentIndex + 1 >= questions.length ? "See Results" : "Next Question"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
