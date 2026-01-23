import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { CountdownTimer } from "@/components/CountdownTimer";
import { ParticipantCount } from "@/components/ParticipantCount";
import { supabase } from "@/integrations/supabase/client";
import { getSession } from "@/lib/session";
import type { Event } from "@/lib/types";
export default function WaitingRoom() {
  const {
    eventId
  } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState<Event | null>(null);
  const [participantCount, setParticipantCount] = useState(0);
  useEffect(() => {
    const session = getSession();
    if (!session || session.eventId !== eventId) {
      navigate("/");
      return;
    }
    fetchEvent();
    fetchParticipantCount();

    // Subscribe to realtime updates
    const eventChannel = supabase.channel("event-updates").on("postgres_changes", {
      event: "UPDATE",
      schema: "public",
      table: "events",
      filter: `id=eq.${eventId}`
    }, payload => {
      const updatedEvent = payload.new as Event;
      setEvent(updatedEvent);
      if (updatedEvent.status === "revealed") {
        navigate(`/reveal/${eventId}`);
      }
    }).subscribe();
    const participantChannel = supabase.channel("participant-count").on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "participants",
      filter: `event_id=eq.${eventId}`
    }, () => {
      fetchParticipantCount();
    }).subscribe();
    return () => {
      supabase.removeChannel(eventChannel);
      supabase.removeChannel(participantChannel);
    };
  }, [eventId, navigate]);
  const fetchEvent = async () => {
    const {
      data
    } = await supabase.from("events").select("*").eq("id", eventId).single();
    if (data) {
      setEvent(data as Event);
      if (data.status === "revealed") {
        navigate(`/reveal/${eventId}`);
      }
    }
  };
  const fetchParticipantCount = async () => {
    const {
      count
    } = await supabase.from("participants").select("*", {
      count: "exact",
      head: true
    }).eq("event_id", eventId);
    setParticipantCount(count || 0);
  };
  const getTargetTime = () => {
    if (event?.reveal_time) {
      return new Date(event.reveal_time);
    }
    // Default to 30 minutes from now if no reveal time set
    const defaultTime = new Date();
    defaultTime.setMinutes(defaultTime.getMinutes() + 30);
    return defaultTime;
  };
  return <div className="min-h-screen flex flex-col items-center justify-center p-6">
      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[120px]" />
        <motion.div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary/30 to-transparent" animate={{
        opacity: [0.3, 0.6, 0.3]
      }} transition={{
        duration: 2,
        repeat: Infinity
      }} />
      </div>

      <motion.div initial={{
      opacity: 0,
      y: 30
    }} animate={{
      opacity: 1,
      y: 0
    }} transition={{
      duration: 0.6
    }} className="relative z-10 text-center max-w-lg w-full">

        {/* Event name */}
        <motion.h1 initial={{
        opacity: 0,
        y: 20
      }} animate={{
        opacity: 1,
        y: 0
      }} transition={{
        delay: 0.3
      }} className="font-display text-4xl sm:text-5xl font-bold text-foreground mb-3">
          {event?.name || "Loading..."}
        </motion.h1>

        {/* Status message */}
        <motion.p initial={{
        opacity: 0
      }} animate={{
        opacity: 1
      }} transition={{
        delay: 0.4
      }} className="text-lg mb-10 text-primary">
          {event?.status === "matching" ? "✨ Matching in progress..." : event?.reveal_time ? "Matching begins at reveal time" : "Waiting for host to start matching..."}
        </motion.p>

        {/* Countdown timer */}
        {event?.reveal_time && event.status === "waiting" && <motion.div initial={{
        opacity: 0,
        scale: 0.9
      }} animate={{
        opacity: 1,
        scale: 1
      }} transition={{
        delay: 0.5
      }} className="mb-10">
            <CountdownTimer targetTime={getTargetTime()} />
          </motion.div>}

        {/* Participant count */}
        <motion.div initial={{
        opacity: 0
      }} animate={{
        opacity: 1
      }} transition={{
        delay: 0.6
      }} className="mb-8">
          <ParticipantCount count={participantCount} />
        </motion.div>

        {/* Fun waiting messages */}
        <motion.div initial={{
        opacity: 0
      }} animate={{
        opacity: 1
      }} transition={{
        delay: 0.7
      }} className="glass-card p-6">
          <p className="text-muted-foreground text-sm mb-2">While you wait...</p>
          <p className="text-foreground">
            {["Take a deep breath, your match is being calculated ✨", "The algorithm is working its magic 🪄", "Your perfect match is just moments away 💕", "Get ready to meet someone special 🌟"][Math.floor(Math.random() * 4)]}
          </p>
        </motion.div>
      </motion.div>
    </div>;
}