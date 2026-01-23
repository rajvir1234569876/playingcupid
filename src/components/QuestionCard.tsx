import { motion } from "framer-motion";
import type { Question } from "@/lib/types";
interface QuestionCardProps {
  question: Question;
  selectedAnswer: string | null;
  onSelect: (answer: string) => void;
  currentIndex: number;
  totalQuestions: number;
}
export function QuestionCard({
  question,
  selectedAnswer,
  onSelect,
  currentIndex,
  totalQuestions
}: QuestionCardProps) {
  return <motion.div key={question.id} initial={{
    opacity: 0,
    x: 50
  }} animate={{
    opacity: 1,
    x: 0
  }} exit={{
    opacity: 0,
    x: -50
  }} className="max-w-lg mx-auto">
      {/* Progress indicator */}
      <div className="mb-6">
        <div className="flex justify-between text-sm text-muted-foreground mb-2">
          <span>Question {currentIndex + 1}</span>
          <span>{currentIndex + 1} / {totalQuestions}</span>
        </div>
        <div className="h-1 bg-muted rounded-full overflow-hidden">
          <motion.div className="h-full bg-primary" initial={{
          width: 0
        }} animate={{
          width: `${(currentIndex + 1) / totalQuestions * 100}%`
        }} transition={{
          duration: 0.3
        }} />
        </div>
      </div>

      {/* Question card - Red background with yellow text */}
      <div className="question-card p-6 sm:p-8 mb-6 text-primary-foreground">
        <h3 className="font-display text-2xl sm:text-3xl text-center font-bold text-primary-foreground">
          {question.question}
        </h3>
      </div>

      {/* Options */}
      <div className="space-y-3">
        {question.options.map((option, index) => {
        const isSelected = selectedAnswer === option;
        return <motion.button key={option} initial={{
          opacity: 0,
          y: 20
        }} animate={{
          opacity: 1,
          y: 0
        }} transition={{
          delay: index * 0.1
        }} onClick={() => onSelect(option)} className={`
                w-full p-4 sm:p-5 rounded-xl text-left transition-all duration-200
                border-2
                ${isSelected ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-foreground hover:border-primary/50 hover:bg-card/80"}
              `}>
              <div className="flex items-center gap-4">
                <div className={`
                  w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                  ${isSelected ? "bg-primary-foreground text-primary" : "bg-muted text-muted-foreground"}
                `}>
                  {String.fromCharCode(65 + index)}
                </div>
                <span className="text-base sm:text-lg font-medium">{option}</span>
              </div>
            </motion.button>;
      })}
      </div>
    </motion.div>;
}