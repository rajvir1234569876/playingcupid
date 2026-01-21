import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HeartIcon } from "@/components/ui/HeartIcon";
import { Sparkles, ArrowRight, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { saveEventCode } from "@/lib/session";
export default function JoinEvent() {
  const [eventCode, setEventCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventCode.trim()) {
      toast.error("Please enter an event code");
      return;
    }
    setIsLoading(true);
    try {
      const {
        data: event,
        error
      } = await supabase.from("events").select("*").eq("code", eventCode.toUpperCase().trim()).maybeSingle();
      if (error) throw error;
      if (!event) {
        toast.error("Event not found. Check your code and try again.");
        return;
      }
      if (event.status === "revealed") {
        toast.error("This event has already ended.");
        return;
      }
      saveEventCode(event.code);
      navigate(`/form/${event.id}`);
    } catch (error) {
      console.error("Error joining event:", error);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };
  return <div className="min-h-screen flex flex-col items-center justify-center p-6">
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[120px]" />
      </div>

      <motion.div initial={{
      opacity: 0,
      y: 30
    }} animate={{
      opacity: 1,
      y: 0
    }} transition={{
      duration: 0.6
    }} className="relative z-10 text-center max-w-md w-full">
        {/* Logo/Icon */}
        <motion.div initial={{
        scale: 0
      }} animate={{
        scale: 1
      }} transition={{
        delay: 0.2,
        type: "spring",
        stiffness: 200
      }} className="mb-8">
          <HeartIcon className="w-20 h-20 text-primary mx-auto" animate />
        </motion.div>

        {/* Title */}
        <motion.h1 initial={{
        opacity: 0,
        y: 20
      }} animate={{
        opacity: 1,
        y: 0
      }} transition={{
        delay: 0.3
      }} className="font-display text-5xl sm:text-6xl font-bold mb-4">
          <span className="text-primary">meet</span>
          <span className="text-primary">up</span>
        </motion.h1>

        <motion.p initial={{
        opacity: 0
      }} animate={{
        opacity: 1
      }} transition={{
        delay: 0.4
      }} className="text-lg mb-10 text-primary-foreground">
          One event. One match. One moment.
        </motion.p>

        {/* Join form */}
        <motion.form initial={{
        opacity: 0,
        y: 20
      }} animate={{
        opacity: 1,
        y: 0
      }} transition={{
        delay: 0.5
      }} onSubmit={handleJoin} className="glass-card p-6 sm:p-8">
          <div className="flex items-center gap-2 justify-center mb-6 text-champagne">
            <Sparkles className="w-5 h-5 text-primary-foreground" />
            <span className="text-sm font-medium uppercase tracking-wider text-primary">Enter Event Code</span>
          </div>

          <Input type="text" placeholder="LOVE2024" value={eventCode} onChange={e => setEventCode(e.target.value.toUpperCase())} className="text-center text-2xl font-mono tracking-widest h-14 bg-background/50 border-border/50 mb-4" maxLength={10} />

          <Button type="submit" disabled={isLoading || !eventCode.trim()} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-button h-12 text-lg">
            {isLoading ? "Joining..." : <>
                Join Event
                <ArrowRight className="w-5 h-5 ml-2" />
              </>}
          </Button>
        </motion.form>

        {/* Host link */}
        <motion.div initial={{
        opacity: 0
      }} animate={{
        opacity: 1
      }} transition={{
        delay: 0.7
      }} className="mt-8">
          <Button variant="ghost" onClick={() => navigate("/admin")} className="text-foreground hover:text-foreground">
            <Users className="w-4 h-4 mr-2" />
            Host an event
          </Button>
        </motion.div>
      </motion.div>
    </div>;
}