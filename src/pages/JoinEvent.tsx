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

      
    </div>;
}