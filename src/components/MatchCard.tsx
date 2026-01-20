import { motion } from "framer-motion";
import { HeartIcon } from "./ui/HeartIcon";
import { Button } from "./ui/button";
import { MapPin, MessageCircle, RefreshCw, Sparkles } from "lucide-react";
import type { Participant } from "@/lib/types";

interface MatchCardProps {
  match: Participant;
  commonInterests: string[];
  compatibilityScore: number;
  badge: string;
  onFindThem: () => void;
  onIcebreaker: () => void;
  onRematch: () => void;
  canRematch: boolean;
}

export function MatchCard({
  match,
  commonInterests,
  compatibilityScore,
  badge,
  onFindThem,
  onIcebreaker,
  onRematch,
  canRematch,
}: MatchCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 50 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="glass-card p-8 max-w-md mx-auto text-center relative overflow-hidden"
    >
      {/* Decorative glow */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-transparent to-transparent pointer-events-none" />
      
      {/* Heart icon */}
      <motion.div 
        className="relative z-10 mb-6"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
      >
        <HeartIcon className="w-16 h-16 text-primary mx-auto" animate />
      </motion.div>

      {/* Match name */}
      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="font-display text-4xl font-bold text-foreground mb-2"
      >
        {match.name}
      </motion.h2>

      {/* Age & City */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="flex items-center justify-center gap-3 text-muted-foreground mb-4"
      >
        <span className="text-lg">{match.age} years old</span>
        {match.city && (
          <>
            <span className="text-primary">•</span>
            <span className="flex items-center gap-1">
              <MapPin className="w-4 h-4" />
              {match.city}
            </span>
          </>
        )}
      </motion.div>

      {/* Compatibility score */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.6, type: "spring" }}
        className="mb-6"
      >
        <div className="inline-flex items-center gap-2 bg-primary/20 px-6 py-3 rounded-full border border-primary/30">
          <Sparkles className="w-5 h-5 text-champagne" />
          <span className="text-2xl font-bold text-primary">{compatibilityScore}%</span>
          <span className="text-foreground/80">compatible</span>
        </div>
      </motion.div>

      {/* Badge line */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        className="text-lg text-champagne italic mb-6 gold-shimmer"
      >
        "{badge}"
      </motion.p>

      {/* Common interests */}
      {commonInterests.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mb-8"
        >
          <p className="text-sm text-muted-foreground mb-3">You both love</p>
          <div className="flex flex-wrap justify-center gap-2">
            {commonInterests.map((interest, i) => (
              <motion.span
                key={interest}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.9 + i * 0.1 }}
                className="px-4 py-2 bg-secondary/50 rounded-full text-sm text-foreground border border-border/50"
              >
                {interest}
              </motion.span>
            ))}
          </div>
        </motion.div>
      )}

      {/* Action buttons */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1 }}
        className="space-y-3"
      >
        <Button
          onClick={onFindThem}
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-button"
          size="lg"
        >
          <MapPin className="w-5 h-5 mr-2" />
          Find Them
        </Button>
        
        <Button
          onClick={onIcebreaker}
          variant="outline"
          className="w-full border-champagne/50 text-champagne hover:bg-champagne/10"
          size="lg"
        >
          <MessageCircle className="w-5 h-5 mr-2" />
          Get Icebreaker
        </Button>

        {canRematch && (
          <Button
            onClick={onRematch}
            variant="ghost"
            className="w-full text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Request Rematch (1 available)
          </Button>
        )}
      </motion.div>
    </motion.div>
  );
}
