import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { MatchCard } from "@/components/MatchCard";
import { HeartIcon } from "@/components/ui/HeartIcon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { getSession } from "@/lib/session";
import { toast } from "sonner";
import type { Participant, Answer } from "@/lib/types";

const ICEBREAKERS = [
  "What's the most spontaneous thing you've ever done?",
  "If you could have dinner with anyone, who would it be?",
  "What's your go-to karaoke song?",
  "What's the best trip you've ever taken?",
  "What's something on your bucket list?",
  "What's your comfort food?",
  "If you won the lottery, what's the first thing you'd do?",
  "What's a skill you wish you had?",
];

export default function RevealPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<"loading" | "countdown" | "reveal" | "match" | "no-match">("loading");
  const [countdown, setCountdown] = useState(3);
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [match, setMatch] = useState<Participant | null>(null);
  const [commonInterests, setCommonInterests] = useState<string[]>([]);
  const [showIcebreaker, setShowIcebreaker] = useState(false);
  const [currentIcebreaker, setCurrentIcebreaker] = useState("");

  const fireConfetti = useCallback(() => {
    const duration = 3000;
    const end = Date.now() + duration;

    const colors = ["#e63946", "#f4a261", "#e9c46a", "#ff69b4"];

    (function frame() {
      confetti({
        particleCount: 4,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors,
      });
      confetti({
        particleCount: 4,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors,
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    })();
  }, []);

  useEffect(() => {
    const session = getSession();
    if (!session || session.eventId !== eventId) {
      navigate("/");
      return;
    }

    fetchParticipantAndMatch(session.participantId);
  }, [eventId, navigate]);

  const fetchParticipantAndMatch = async (participantId: string) => {
    try {
      // Fetch current participant
      const { data: participantData, error: participantError } = await supabase
        .from("participants")
        .select("*")
        .eq("id", participantId)
        .single();

      if (participantError) throw participantError;
      
      const currentParticipant = {
        ...participantData,
        answers: (participantData.answers || []) as unknown as Answer[],
        hobbies: (participantData.hobbies || []) as string[],
        show_me: (participantData.show_me || []) as string[],
      } as Participant;
      
      setParticipant(currentParticipant);

      // Start countdown
      setPhase("countdown");
      
      // Countdown animation
      let count = 3;
      const interval = setInterval(() => {
        count--;
        setCountdown(count);
        if (count === 0) {
          clearInterval(interval);
          setTimeout(() => {
            setPhase("reveal");
            // Show reveal text for 2 seconds then show match
            setTimeout(async () => {
              if (currentParticipant.matched_to) {
                // Fetch match details
                const { data: matchData } = await supabase
                  .from("participants")
                  .select("*")
                  .eq("id", currentParticipant.matched_to)
                  .single();

                if (matchData) {
                  const matchParticipant = {
                    ...matchData,
                    answers: (matchData.answers || []) as unknown as Answer[],
                    hobbies: (matchData.hobbies || []) as string[],
                    show_me: (matchData.show_me || []) as string[],
                  } as Participant;
                  setMatch(matchParticipant);
                  
                  // Calculate common interests
                  const common = currentParticipant.hobbies.filter(h => 
                    matchParticipant.hobbies.includes(h)
                  );
                  setCommonInterests(common);
                  
                  setPhase("match");
                  fireConfetti();
                } else {
                  setPhase("no-match");
                }
              } else {
                setPhase("no-match");
              }
            }, 2000);
          }, 500);
        }
      }, 1000);

      return () => clearInterval(interval);
    } catch (error) {
      console.error("Error fetching participant:", error);
      toast.error("Something went wrong");
    }
  };

  const handleFindThem = () => {
    toast.success("Look around the venue! Your match is waiting 💕", {
      duration: 5000,
    });
  };

  const handleIcebreaker = () => {
    const randomIcebreaker = ICEBREAKERS[Math.floor(Math.random() * ICEBREAKERS.length)];
    setCurrentIcebreaker(randomIcebreaker);
    setShowIcebreaker(true);
  };

  const handleRematch = async () => {
    if (!participant) return;
    
    toast.info("Rematch request sent! The host will review your request.");
    // Mark rematch as used
    await supabase
      .from("participants")
      .update({ rematch_used: true })
      .eq("id", participant.id);
    
    setParticipant(prev => prev ? { ...prev, rematch_used: true } : null);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 overflow-hidden">
      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[700px] bg-primary/15 rounded-full blur-[150px]" />
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-champagne/10 rounded-full blur-[100px]" />
      </div>

      <AnimatePresence mode="wait">
        {/* Loading */}
        {phase === "loading" && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-center"
          >
            <HeartIcon className="w-16 h-16 text-primary mx-auto animate-pulse" />
            <p className="text-muted-foreground mt-4">Loading your match...</p>
          </motion.div>
        )}

        {/* Countdown */}
        {phase === "countdown" && (
          <motion.div
            key="countdown"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.5 }}
            className="text-center"
          >
            <motion.span
              key={countdown}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.5, opacity: 0 }}
              className="font-display text-[150px] sm:text-[200px] font-bold text-primary glow-text"
            >
              {countdown}
            </motion.span>
          </motion.div>
        )}

        {/* Reveal text */}
        {phase === "reveal" && (
          <motion.div
            key="reveal"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="text-center"
          >
            <motion.p
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="text-lg text-champagne mb-4"
            >
              👉 Your match is...
            </motion.p>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="flex justify-center gap-2"
            >
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  animate={{ 
                    opacity: [0.3, 1, 0.3],
                    scale: [0.8, 1, 0.8]
                  }}
                  transition={{ 
                    duration: 0.8, 
                    repeat: Infinity,
                    delay: i * 0.2 
                  }}
                  className="w-4 h-4 rounded-full bg-primary"
                />
              ))}
            </motion.div>
          </motion.div>
        )}

        {/* Match card */}
        {phase === "match" && match && participant && (
          <motion.div
            key="match"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full max-w-md"
          >
            <MatchCard
              match={match}
              commonInterests={commonInterests}
              compatibilityScore={participant.compatibility_score || 75}
              badge={participant.compatibility_badge || "A match made in the stars ✨"}
              onFindThem={handleFindThem}
              onIcebreaker={handleIcebreaker}
              onRematch={handleRematch}
              canRematch={!participant.rematch_used}
            />
          </motion.div>
        )}

        {/* No match */}
        {phase === "no-match" && (
          <motion.div
            key="no-match"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center glass-card p-8 max-w-md"
          >
            <HeartIcon className="w-16 h-16 text-muted-foreground mx-auto mb-6" />
            <h2 className="font-display text-2xl font-bold text-foreground mb-3">
              No Match This Time
            </h2>
            <p className="text-muted-foreground mb-6">
              Don't worry! Sometimes the stars don't align, but your perfect match might be at the next event.
            </p>
            <Button
              onClick={() => navigate("/")}
              className="bg-primary hover:bg-primary/90"
            >
              Join Another Event
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Icebreaker dialog */}
      <Dialog open={showIcebreaker} onOpenChange={setShowIcebreaker}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-foreground">
              Conversation Starter 💬
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Use this to break the ice with your match!
            </DialogDescription>
          </DialogHeader>
          <div className="p-4 bg-secondary/30 rounded-lg">
            <p className="text-lg text-foreground text-center">
              "{currentIcebreaker}"
            </p>
          </div>
          <Button
            onClick={() => {
              const newIcebreaker = ICEBREAKERS[Math.floor(Math.random() * ICEBREAKERS.length)];
              setCurrentIcebreaker(newIcebreaker);
            }}
            variant="outline"
            className="w-full"
          >
            Get Another One
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
