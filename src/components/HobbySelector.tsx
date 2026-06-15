import { motion } from "framer-motion";
import type { Hobby } from "@/lib/types";

interface HobbySelectorProps {
  hobbies: Hobby[];
  selected: string[];
  onToggle: (hobby: string) => void;
  maxSelections?: number;
}

export function HobbySelector({ 
  hobbies, 
  selected, 
  onToggle, 
  maxSelections = 5 
}: HobbySelectorProps) {
  const canSelectMore = selected.length < maxSelections;

  return (
    <div>
      <p className="text-sm text-white/80 mb-4 text-center">
        Select up to {maxSelections} hobbies ({selected.length}/{maxSelections})
      </p>
      
      <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
        {hobbies.map((hobby, index) => {
          const isSelected = selected.includes(hobby.name);
          const isDisabled = !isSelected && !canSelectMore;

          return (
            <motion.button
              key={hobby.id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.03 }}
              onClick={() => !isDisabled && onToggle(hobby.name)}
              disabled={isDisabled}
              className={`
                px-4 py-2.5 rounded-full text-sm font-medium transition-all duration-200
                flex items-center gap-2
                ${isSelected
                  ? "bg-[#C40E16] text-white border-2 border-[#1A1A1A] shadow-button"
                  : isDisabled
                    ? "bg-muted/50 text-muted-foreground/50 cursor-not-allowed"
                    : "bg-card border border-border/50 text-foreground hover:border-primary/50 hover:bg-card/80"
                }
              `}
            >
              {hobby.emoji && <span>{hobby.emoji}</span>}
              <span>{hobby.name}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
