import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Search, Loader2, Heart, Instagram } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface MatchResult {
  matchName: string;
  matchAge: number;
  compatibilityScore: number;
  compatibilityBadge: string;
  instagram: string | null;
}

export default function CheckMatches() {
  const navigate = useNavigate();
  const [eventCode, setEventCode] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [notRevealed, setNotRevealed] = useState(false);

  const handleCheckMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!eventCode.trim() || !name.trim()) {
      toast.error("Please enter both event code and name");
      return;
    }

    setIsLoading(true);
    setMatchResult(null);
    setNotFound(false);
    setNotRevealed(false);

    try {
      // First, find the event by code
      const { data: event, error: eventError } = await supabase
        .from("events")
        .select("id, status")
        .eq("code", eventCode.toUpperCase().trim())
        .maybeSingle();

      if (eventError) throw eventError;

      if (!event) {
        toast.error("Event not found. Please check your event code.");
        setNotFound(true);
        return;
      }

      // Check if event has been revealed
      if (event.status !== "revealed") {
        setNotRevealed(true);
        return;
      }

      // Find the participant by name (case-insensitive)
      const { data: participants, error: participantError } = await supabase
        .from("participants")
        .select("id, name, matched_to, compatibility_score, compatibility_badge")
        .eq("event_id", event.id);

      if (participantError) throw participantError;

      // Find participant with matching name (case-insensitive)
      const participant = participants?.find(
        (p) => p.name.toLowerCase().trim() === name.toLowerCase().trim()
      );

      if (!participant) {
        setNotFound(true);
        return;
      }

      if (!participant.matched_to) {
        setNotFound(true);
        return;
      }

      // Fetch the matched person's details
      const { data: matchData, error: matchError } = await supabase
        .from("participants")
        .select("name, age, instagram")
        .eq("id", participant.matched_to)
        .single();

      if (matchError || !matchData) {
        setNotFound(true);
        return;
      }

      setMatchResult({
        matchName: matchData.name,
        matchAge: matchData.age,
        compatibilityScore: participant.compatibility_score || 75,
        compatibilityBadge: participant.compatibility_badge || "A match made in the stars ✨",
        instagram: matchData.instagram,
      });

    } catch (error) {
      console.error("Error checking match:", error);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const resetSearch = () => {
    setMatchResult(null);
    setNotFound(false);
    setNotRevealed(false);
    setEventCode("");
    setName("");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 text-center max-w-md w-full"
      >
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-8"
        >
          <h1 className="font-display text-4xl font-bold mb-2">
            <span className="text-primary font-serif">Check</span>{" "}
            <span className="text-primary font-serif">Matches</span>
          </h1>
          <p className="text-muted-foreground">
            Enter your event code and name to view your match
          </p>
        </motion.div>

        <AnimatePresence mode="wait">
          {/* Search Form */}
          {!matchResult && !notFound && !notRevealed && (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 justify-center">
                    <Search className="w-5 h-5 text-primary" />
                    Find Your Match
                  </CardTitle>
                  <CardDescription>
                    Enter the details you used when joining the event
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCheckMatch} className="space-y-4">
                    <div className="text-left">
                      <Label htmlFor="eventCode">Event Code</Label>
                      <Input
                        id="eventCode"
                        placeholder="eg. XXXXXX"
                        value={eventCode}
                        onChange={(e) => setEventCode(e.target.value.toUpperCase())}
                        className="text-center font-mono tracking-wider uppercase"
                        maxLength={10}
                      />
                    </div>
                    <div className="text-left">
                      <Label htmlFor="name">Your Name</Label>
                      <Input
                        id="name"
                        placeholder="Enter your name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="text-center"
                      />
                    </div>
                    <Button
                      type="submit"
                      disabled={isLoading || !eventCode.trim() || !name.trim()}
                      className="w-full bg-primary hover:bg-primary/90 h-12"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Checking...
                        </>
                      ) : (
                        <>
                          <Search className="w-4 h-4 mr-2" />
                          Check My Match
                        </>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Match Found */}
          {matchResult && (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
              <Card className="bg-card border-border overflow-hidden">
                <div className="bg-gradient-to-br from-primary/20 to-accent/20 p-6">
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    <p className="text-primary text-sm font-medium mb-2">💌 Your Match Is...</p>
                    <h2 className="font-display text-3xl font-bold text-foreground mb-1">
                      {matchResult.matchName}
                    </h2>
                    <p className="text-muted-foreground">{matchResult.matchAge} years old</p>
                  </motion.div>
                </div>

                <CardContent className="p-6 space-y-4">
                  {/* Compatibility Score */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="flex items-center justify-center gap-2"
                  >
                    <Heart className="w-5 h-5 text-primary fill-primary" />
                    <span className="text-2xl font-bold text-primary">
                      {matchResult.compatibilityScore}%
                    </span>
                    <span className="text-muted-foreground">compatible</span>
                  </motion.div>

                  {/* Compatibility Badge */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="bg-secondary/20 rounded-lg p-4"
                  >
                    <p className="text-sm text-center italic">
                      "{matchResult.compatibilityBadge}"
                    </p>
                  </motion.div>

                  {/* Instagram Handle */}
                  {matchResult.instagram && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 }}
                      className="flex items-center justify-center gap-2 text-muted-foreground"
                    >
                      <Instagram className="w-4 h-4" />
                      <span>@{matchResult.instagram.replace("@", "")}</span>
                    </motion.div>
                  )}

                  <Button
                    onClick={resetSearch}
                    variant="outline"
                    className="w-full mt-4"
                  >
                    Check Another Match
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Not Revealed Yet */}
          {notRevealed && (
            <motion.div
              key="not-revealed"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Card className="bg-card border-border">
                <CardContent className="py-8 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center text-5xl">
                    ⏳
                  </div>
                  <h3 className="font-display text-xl font-bold mb-2">
                    Matches Haven't Been Revealed Yet
                  </h3>
                  <p className="text-muted-foreground mb-6">
                    The host hasn't revealed matches for this event yet. Please check again later.
                  </p>
                  <Button onClick={resetSearch} variant="outline">
                    Try Again
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* No Match Found */}
          {notFound && (
            <motion.div
              key="not-found"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Card className="bg-card border-border">
                <CardContent className="py-8 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center text-5xl">
                    🔍
                  </div>
                  <h3 className="font-display text-xl font-bold mb-2">
                    No Match Found
                  </h3>
                  <p className="text-muted-foreground mb-6">
                    No match found for this name and event code yet. Please check your details and try again.
                  </p>
                  <Button onClick={resetSearch} variant="outline">
                    Try Again
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Back button */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-8"
        >
          <Button
            variant="ghost"
            onClick={() => navigate("/join")}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </motion.div>
      </motion.div>
    </div>
  );
}
