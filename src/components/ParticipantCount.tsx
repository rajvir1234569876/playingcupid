import { motion } from "framer-motion";
import { Users } from "lucide-react";

interface ParticipantCountProps {
  count: number;
}

export function ParticipantCount({ count }: ParticipantCountProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center justify-center gap-3 text-muted-foreground"
    >
      <div className="flex items-center gap-2 bg-card/50 px-4 py-2 rounded-full border border-border/50">
        <Users className="w-5 h-5 text-primary" />
        <span className="text-lg">
          <motion.span
            key={count}
            initial={{ scale: 1.2, color: "hsl(var(--primary))" }}
            animate={{ scale: 1, color: "hsl(var(--foreground))" }}
            className="font-semibold"
          >
            {count}
          </motion.span>
          {" "}participant{count !== 1 ? "s" : ""} waiting
        </span>
      </div>
    </motion.div>
  );
}
