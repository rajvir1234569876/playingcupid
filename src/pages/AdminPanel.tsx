import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { HeartIcon } from "@/components/ui/HeartIcon";
import { Plus, Users, Play, Clock, Copy, Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Event } from "@/lib/types";
export default function AdminPanel() {
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isTriggering, setIsTriggering] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [authPassword, setAuthPassword] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [authAction, setAuthAction] = useState<"reveal" | null>(null);

  // New event form
  const [newEvent, setNewEvent] = useState({
    name: "",
    ageRange: "2",
    revealTime: "",
    adminPassword: ""
  });
  useEffect(() => {
    fetchEvents();
  }, []);
  const fetchEvents = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from("events").select("*").order("created_at", {
        ascending: false
      });
      if (error) throw error;
      setEvents((data || []) as Event[]);
    } catch (error) {
      console.error("Error fetching events:", error);
      toast.error("Failed to load events");
    } finally {
      setIsLoading(false);
    }
  };
  const generateEventCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };
  const createEvent = async () => {
    if (!newEvent.name.trim()) {
      toast.error("Please enter an event name");
      return;
    }
    if (!newEvent.adminPassword) {
      toast.error("Please set an admin password");
      return;
    }
    setIsCreating(true);
    try {
      const code = generateEventCode();
      const {
        data,
        error
      } = await supabase.from("events").insert({
        name: newEvent.name.trim(),
        code,
        age_range: parseInt(newEvent.ageRange),
        reveal_time: newEvent.revealTime || null,
        admin_password: newEvent.adminPassword,
        status: "waiting"
      }).select().single();
      if (error) throw error;
      toast.success(`Event created! Code: ${code}`);
      setNewEvent({
        name: "",
        ageRange: "2",
        revealTime: "",
        adminPassword: ""
      });
      fetchEvents();
    } catch (error) {
      console.error("Error creating event:", error);
      toast.error("Failed to create event");
    } finally {
      setIsCreating(false);
    }
  };
  const handleTriggerReveal = (event: Event) => {
    setSelectedEvent(event);
    setAuthAction("reveal");
    setShowAuthDialog(true);
  };
  const authenticateAndTrigger = async () => {
    if (!selectedEvent) return;
    if (authPassword !== selectedEvent.admin_password) {
      toast.error("Incorrect password");
      return;
    }
    setShowAuthDialog(false);
    setAuthPassword("");
    if (authAction === "reveal") {
      await triggerReveal(selectedEvent.id);
    }
  };
  const triggerReveal = async (eventId: string) => {
    setIsTriggering(eventId);
    try {
      // First, update status to matching
      await supabase.from("events").update({
        status: "matching"
      }).eq("id", eventId);

      // Call the matching edge function
      const {
        error: fnError
      } = await supabase.functions.invoke("run-matching", {
        body: {
          eventId
        }
      });
      if (fnError) throw fnError;
      toast.success("Matching complete! Revealing to participants...");
      fetchEvents();
    } catch (error) {
      console.error("Error triggering reveal:", error);
      toast.error("Failed to trigger matching");
      // Revert status
      await supabase.from("events").update({
        status: "waiting"
      }).eq("id", eventId);
    } finally {
      setIsTriggering(null);
    }
  };
  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success("Code copied!");
    setTimeout(() => setCopiedCode(null), 2000);
  };
  const getParticipantCount = async (eventId: string) => {
    const {
      count
    } = await supabase.from("participants").select("*", {
      count: "exact",
      head: true
    }).eq("event_id", eventId);
    return count || 0;
  };
  const [participantCounts, setParticipantCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    const fetchCounts = async () => {
      const counts: Record<string, number> = {};
      for (const event of events) {
        counts[event.id] = await getParticipantCount(event.id);
      }
      setParticipantCounts(counts);
    };
    if (events.length > 0) fetchCounts();
  }, [events]);
  return <div className="min-h-screen p-6">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 right-1/4 w-[400px] h-[400px] bg-primary/10 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto">
        {/* Header */}
        <motion.div initial={{
        opacity: 0,
        y: -20
      }} animate={{
        opacity: 1,
        y: 0
      }} className="flex items-center gap-3 mb-8">
          <HeartIcon className="w-10 h-10 text-primary" />
          <div>
            <h1 className="font-display text-3xl font-bold text-primary">
              Admin Panel
            </h1>
            <p className="text-primary">Manage your "meetup" events</p>
          </div>
        </motion.div>

        <Tabs defaultValue="events" className="space-y-6">
          <TabsList className="bg-card border border-border">
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="create">Create New</TabsTrigger>
          </TabsList>

          {/* Events list */}
          <TabsContent value="events">
            {isLoading ? <div className="text-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
              </div> : events.length === 0 ? <Card className="bg-card border-border">
                <CardContent className="py-12 text-center">
                  <HeartIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No events yet. Create your first event!</p>
                </CardContent>
              </Card> : <div className="space-y-4">
                {events.map((event, index) => <motion.div key={event.id} initial={{
              opacity: 0,
              y: 20
            }} animate={{
              opacity: 1,
              y: 0
            }} transition={{
              delay: index * 0.1
            }}>
                    <Card className="bg-card border-border">
                      <CardHeader className="pb-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <CardTitle className="text-foreground">{event.name}</CardTitle>
                            <CardDescription className="flex items-center gap-2 mt-1">
                              <span className={`
                                px-2 py-0.5 rounded-full text-xs font-medium
                                ${event.status === "waiting" ? "bg-yellow-500/20 text-yellow-400" : event.status === "matching" ? "bg-blue-500/20 text-blue-400" : "bg-green-500/20 text-green-400"}
                              `}>
                                {event.status}
                              </span>
                            </CardDescription>
                          </div>
                          <Button variant="outline" size="sm" onClick={() => copyCode(event.code)} className="gap-2">
                            {copiedCode === event.code ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            {event.code}
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-6 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Users className="w-4 h-4" />
                              {participantCounts[event.id] || 0} participants
                            </span>
                            {event.reveal_time && <span className="flex items-center gap-1">
                                <Clock className="w-4 h-4" />
                                {new Date(event.reveal_time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
                              </span>}
                          </div>
                          
                          {event.status === "waiting" && <Button onClick={() => handleTriggerReveal(event)} disabled={isTriggering === event.id} className="bg-primary hover:bg-primary/90">
                              {isTriggering === event.id ? <>
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                  Matching...
                                </> : <>
                                  <Play className="w-4 h-4 mr-2" />
                                  Trigger Reveal
                                </>}
                            </Button>}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>)}
              </div>}
          </TabsContent>

          {/* Create event */}
          <TabsContent value="create">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-foreground">Create New Event</CardTitle>
                <CardDescription>Set up a new matching event</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="eventName">Event Name</Label>
                  <Input id="eventName" placeholder="Valentine's Night 2024" value={newEvent.name} onChange={e => setNewEvent(prev => ({
                  ...prev,
                  name: e.target.value
                }))} className="bg-background/50 border-border" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="ageRange">Age Range (±years)</Label>
                    <Input id="ageRange" type="number" min="1" max="10" value={newEvent.ageRange} onChange={e => setNewEvent(prev => ({
                    ...prev,
                    ageRange: e.target.value
                  }))} className="bg-background/50 border-border" />
                  </div>
                  <div>
                    <Label htmlFor="revealTime">Reveal Time (optional)</Label>
                    <Input id="revealTime" type="datetime-local" value={newEvent.revealTime} onChange={e => setNewEvent(prev => ({
                    ...prev,
                    revealTime: e.target.value
                  }))} className="bg-background/50 border-border" />
                  </div>
                </div>

                <div>
                  <Label htmlFor="adminPassword">Admin Password</Label>
                  <Input id="adminPassword" type="password" placeholder="Required to trigger reveal" value={newEvent.adminPassword} onChange={e => setNewEvent(prev => ({
                  ...prev,
                  adminPassword: e.target.value
                }))} className="bg-background/50 border-border" />
                </div>

                <Button onClick={createEvent} disabled={isCreating} className="w-full bg-primary hover:bg-primary/90">
                  {isCreating ? <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </> : <>
                      <Plus className="w-4 h-4 mr-2" />
                      Create Event
                    </>}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Auth dialog */}
      <Dialog open={showAuthDialog} onOpenChange={setShowAuthDialog}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Admin Authentication</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Enter admin password for "{selectedEvent?.name}"</Label>
              <Input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} placeholder="Admin password" className="bg-background/50 border-border mt-2" onKeyDown={e => e.key === "Enter" && authenticateAndTrigger()} />
            </div>
            <Button onClick={authenticateAndTrigger} className="w-full bg-primary hover:bg-primary/90">
              Confirm & Trigger
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>;
}