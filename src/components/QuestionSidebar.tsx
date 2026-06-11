import type { Question, Answer } from "@/lib/types";

interface Props {
  questions: Question[];
  answers: Answer[];
  currentIndex: number;
  onJump: (index: number) => void;
  highlightUnanswered: boolean;
  onSelect?: () => void;
}

export function QuestionSidebar({
  questions,
  answers,
  currentIndex,
  onJump,
  highlightUnanswered,
  onSelect,
}: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {questions.map((q, i) => {
        const isAnswered = answers.some((a) => a.question_id === q.id);
        const isUnanswered = highlightUnanswered && !isAnswered;
        const isCurrent = i === currentIndex;

        return (
          <button
            key={q.id}
            onClick={() => {
              onJump(i);
              onSelect?.();
            }}
            className={[
              "w-8 h-8 rounded-md text-xs font-medium transition-colors",
              isAnswered
                ? "bg-green-500 text-white"
                : isUnanswered
                ? "bg-destructive/20 text-destructive ring-1 ring-destructive/50"
                : "bg-[#1A1A1A] text-white",
              isCurrent ? "ring-2 ring-primary ring-offset-1" : "",
            ].join(" ")}
          >
            {i + 1}
          </button>
        );
      })}
    </div>
  );
}
