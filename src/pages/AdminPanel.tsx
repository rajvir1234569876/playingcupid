import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ParticipantResponsesModal } from "@/components/ParticipantResponsesModal";

import { Plus, Users, Play, Clock, Copy, Check, Loader2, LogOut, ArrowLeft, Heart, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import type { Event, Participant, Answer } from "@/lib/types";

interface MatchPair {
  personA: {
    id: string;
    name: string;
  };
  personB: {
    id: string;
    name: string;
  };
  compatibilityScore: number;
}

interface ParticipantForModal {
  id: string;
  name: string;
  age: number;
  gender: string;
  orientation: string;
  city: string | null;
  hobbies: string[];
  answers: Answer[];
}

export default function AdminPanel() {
  const navigate = useNavigate();

  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authEventCode, setAuthEventCode] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Event state
  const [currentEvent, setCurrentEvent] = useState<Event | null>(null);
  const [participantCount, setParticipantCount] = useState(0);
  const [genderBreakdown, setGenderBreakdown] = useState<{ male: number; female: number; other: number }>({ male: 0, female: 0, other: 0 });
  const [isTriggering, setIsTriggering] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [matchPairs, setMatchPairs] = useState<MatchPair[]>([]);

  // Participants/Responses state
  const [participants, setParticipants] = useState<ParticipantForModal[]>([]);
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState<ParticipantForModal | null>(null);
  const [responsesModalOpen, setResponsesModalOpen] = useState(false);

  // Create event state
  const [activeTab, setActiveTab] = useState("manage");
  const [isCreating, setIsCreating] = useState(false);
  const [newEvent, setNewEvent] = useState({
    name: "",
    ageRange: "2",
    revealTime: "",
    adminPassword: ""
  });

  // Check for stored session on mount
  useEffect(() => {
    const storedEventId = sessionStorage.getItem("admin_event_id");
    if (storedEventId) {
      fetchEventById(storedEventId);
    }
  }, []);

  // Auto-refresh matches when event is revealed
  useEffect(() => {
    if (currentEvent?.status === "revealed") {
      fetchMatchPairs(currentEvent.id);

      // Set up realtime subscription for match updates
      const channel = supabase.channel('participants-changes').on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'participants',
        filter: `event_id=eq.${currentEvent.id}`
      }, () => {
        fetchMatchPairs(currentEvent.id);
      }).subscribe();
      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [currentEvent?.id, currentEvent?.status]);

  // Fetch participants when responses tab is selected
  useEffect(() => {
    if (activeTab === "responses" && currentEvent) {
      fetchParticipants(currentEvent.id);
    }
  }, [activeTab, currentEvent?.id]);

  const fetchEventById = async (eventId: string) => {
    try {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("id", eventId)
        .single();
      if (error || !data) {
        sessionStorage.removeItem("admin_event_id");
        return;
      }
      setCurrentEvent(data as Event);
      setIsAuthenticated(true);
      fetchParticipantCount(eventId);
      if (data.status === "revealed") {
        fetchMatchPairs(eventId);
      }
    } catch (error) {
      console.error("Error fetching event:", error);
      sessionStorage.removeItem("admin_event_id");
    }
  };

  const fetchParticipantCount = async (eventId: string) => {
    const { count } = await supabase
      .from("participants")
      .select("*", { count: "exact", head: true })
      .eq("event_id", eventId);
    setParticipantCount(count || 0);
    
    // Fetch gender breakdown
    const { data: genderData } = await supabase
      .from("participants")
      .select("gender")
      .eq("event_id", eventId);
    
    if (genderData) {
      const breakdown = { male: 0, female: 0, other: 0 };
      genderData.forEach(p => {
        if (p.gender.toLowerCase() === "male") breakdown.male++;
        else if (p.gender.toLowerCase() === "female") breakdown.female++;
        else breakdown.other++;
      });
      setGenderBreakdown(breakdown);
    }
  };

  const fetchMatchPairs = async (eventId: string) => {
    const { data: participants } = await supabase
      .from("participants")
      .select("id, name, matched_to, compatibility_score")
      .eq("event_id", eventId)
      .not("matched_to", "is", null);
    if (!participants) return;
    const pairs: MatchPair[] = [];
    const processedIds = new Set<string>();
    for (const p of participants) {
      if (processedIds.has(p.id)) continue;
      const match = participants.find(m => m.id === p.matched_to);
      if (match && !processedIds.has(match.id)) {
        pairs.push({
          personA: { id: p.id, name: p.name },
          personB: { id: match.id, name: match.name },
          compatibilityScore: p.compatibility_score || 0
        });
        processedIds.add(p.id);
        processedIds.add(match.id);
      }
    }
    setMatchPairs(pairs);
  };

  const fetchParticipants = async (eventId: string) => {
    setLoadingParticipants(true);
    try {
      const { data } = await supabase
        .from("participants")
        .select("id, name, age, gender, orientation, city, hobbies, answers")
        .eq("event_id", eventId)
        .order("created_at", { ascending: true });
      
      if (data) {
        // Type-cast JSON answers to Answer[]
        const typedParticipants = data.map((p) => ({
          ...p,
          answers: (p.answers as unknown as Answer[]) || [],
        }));
        setParticipants(typedParticipants);
      }
    } catch (error) {
      console.error("Error fetching participants:", error);
    } finally {
      setLoadingParticipants(false);
    }
  };

  const handleLogin = async () => {
    if (!authEventCode.trim() || !authPassword.trim()) {
      toast.error("Please enter event code and password");
      return;
    }
    setIsAuthenticating(true);
    try {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("code", authEventCode.toUpperCase().trim())
        .single();
      if (error || !data) {
        toast.error("Event not found");
        return;
      }
      if (data.admin_password !== authPassword) {
        toast.error("Incorrect password");
        return;
      }
      setCurrentEvent(data as Event);
      setIsAuthenticated(true);
      sessionStorage.setItem("admin_event_id", data.id);
      fetchParticipantCount(data.id);
      if (data.status === "revealed") {
        fetchMatchPairs(data.id);
      }
      toast.success(`Welcome! Managing "${data.name}"`);
    } catch (error) {
      console.error("Login error:", error);
      toast.error("Failed to authenticate");
    } finally {
      setIsAuthenticating(false);
      setAuthPassword("");
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentEvent(null);
    setAuthEventCode("");
    setAuthPassword("");
    setMatchPairs([]);
    setParticipants([]);
    sessionStorage.removeItem("admin_event_id");
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
      const { data, error } = await supabase.from("events").insert({
        name: newEvent.name.trim(),
        code,
        age_range: parseInt(newEvent.ageRange),
        reveal_time: newEvent.revealTime || null,
        admin_password: newEvent.adminPassword,
        status: "waiting"
      }).select().single();
      if (error) throw error;
      toast.success(`Event created! Code: ${code}`);

      // Auto-login to the new event
      setCurrentEvent(data as Event);
      setIsAuthenticated(true);
      sessionStorage.setItem("admin_event_id", data.id);
      setParticipantCount(0);
      setActiveTab("manage");

      // Reset form
      setNewEvent({
        name: "",
        ageRange: "2",
        revealTime: "",
        adminPassword: ""
      });
    } catch (error) {
      console.error("Error creating event:", error);
      toast.error("Failed to create event");
    } finally {
      setIsCreating(false);
    }
  };

  const updateAgeRange = async (value: string) => {
    if (!currentEvent) return;
    try {
      const { error } = await supabase
        .from("events")
        .update({ age_range: parseInt(value) })
        .eq("id", currentEvent.id);
      if (error) throw error;
      setCurrentEvent(prev => prev ? { ...prev, age_range: parseInt(value) } : null);
      toast.success(`Age range updated to ±${value} years`);
    } catch (error) {
      console.error("Error updating age range:", error);
      toast.error("Failed to update age range");
    }
  };

  const triggerReveal = async () => {
    if (!currentEvent) return;
    setIsTriggering(true);
    try {
      await supabase
        .from("events")
        .update({ status: "matching" })
        .eq("id", currentEvent.id);
      const { error: fnError } = await supabase.functions.invoke("run-matching", {
        body: { eventId: currentEvent.id }
      });
      if (fnError) throw fnError;
      toast.success("Matching complete! Revealing to participants...");

      // Refresh event data
      const { data } = await supabase
        .from("events")
        .select("*")
        .eq("id", currentEvent.id)
        .single();
      if (data) {
        setCurrentEvent(data as Event);
        fetchMatchPairs(data.id);
      }
    } catch (error) {
      console.error("Error triggering reveal:", error);
      toast.error("Failed to trigger matching");
      await supabase
        .from("events")
        .update({ status: "waiting" })
        .eq("id", currentEvent.id);
    } finally {
      setIsTriggering(false);
    }
  };

  const copyCode = () => {
    if (!currentEvent) return;
    navigator.clipboard.writeText(currentEvent.code);
    setCopiedCode(true);
    toast.success("Code copied!");
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const openResponsesModal = (participant: ParticipantForModal) => {
    setSelectedParticipant(participant);
    setResponsesModalOpen(true);
  };

  // Login screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen p-6 flex items-center justify-center">
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-1/4 right-1/4 w-[400px] h-[400px] bg-primary/5 rounded-full blur-[100px]" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 w-full max-w-md"
        >
          <div className="flex items-center gap-3 mb-8 justify-center">
            <h1 className="font-display text-3xl font-bold text-primary">playingcupid</h1>
          </div>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle>Access Your Event</CardTitle>
              <CardDescription>
                Enter your event code and admin password to manage your event
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="eventCode">Event Code</Label>
                <Input
                  id="eventCode"
                  placeholder="ABC123"
                  value={authEventCode}
                  onChange={e => setAuthEventCode(e.target.value.toUpperCase())}
                  className="bg-card border-border uppercase"
                  maxLength={6}
                />
              </div>
              <div>
                <Label htmlFor="password">Admin Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Your admin password"
                  value={authPassword}
                  onChange={e => setAuthPassword(e.target.value)}
                  className="bg-card border-border"
                  onKeyDown={e => e.key === "Enter" && handleLogin()}
                />
              </div>
              <Button
                onClick={handleLogin}
                disabled={isAuthenticating}
                className="w-full bg-primary hover:bg-primary/90"
              >
                {isAuthenticating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Authenticating...
                  </>
                ) : (
                  "Access Event"
                )}
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Or</span>
                </div>
              </div>

              <Button
                variant="outline"
                onClick={() => {
                  setIsAuthenticated(true);
                  setActiveTab("create");
                }}
                className="w-full"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create New Event
              </Button>

              <Button
                variant="ghost"
                onClick={() => navigate("/")}
                className="w-full text-muted-foreground"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Home
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  // Authenticated view
  return (
    <div className="min-h-screen p-6">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 right-1/4 w-[400px] h-[400px] bg-primary/5 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-8"
        >
          <div className="flex items-center gap-3">
            <div>
              <h1 className="font-display text-3xl font-bold text-primary">playingcupid</h1>
              {currentEvent && <p className="text-muted-foreground">{currentEvent.name}</p>}
            </div>
          </div>
          <Button variant="ghost" onClick={handleLogout} className="gap-2">
            <LogOut className="w-4 h-4" />
            Logout
          </Button>
        </motion.div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-card border border-border">
            <TabsTrigger value="manage" disabled={!currentEvent}>
              Manage Event
            </TabsTrigger>
            <TabsTrigger value="matches" disabled={!currentEvent || currentEvent.status !== "revealed"}>
              Match Table
            </TabsTrigger>
            <TabsTrigger value="responses" disabled={!currentEvent}>
              Responses
            </TabsTrigger>
            <TabsTrigger value="create">Create New</TabsTrigger>
          </TabsList>

          {/* Manage current event */}
          <TabsContent value="manage">
            {currentEvent ? (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="bg-card border-border">
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-2xl">{currentEvent.name}</CardTitle>
                        <CardDescription className="flex items-center gap-2 mt-2">
                          <span
                            className={`
                              px-2 py-0.5 rounded-full text-xs font-medium
                              ${
                                currentEvent.status === "waiting"
                                  ? "bg-yellow-500/20 text-yellow-600"
                                  : currentEvent.status === "matching"
                                  ? "bg-blue-500/20 text-blue-600"
                                  : "bg-green-500/20 text-green-600"
                              }
                            `}
                          >
                            {currentEvent.status}
                          </span>
                        </CardDescription>
                      </div>
                      <Button variant="outline" size="sm" onClick={copyCode} className="gap-2">
                        {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        {currentEvent.code}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-background rounded-lg p-4 text-center">
                        <Users className="w-8 h-8 text-primary mx-auto mb-2" />
                        <p className="text-2xl font-bold">{participantCount}</p>
                        <p className="text-sm text-muted-foreground">Participants</p>
                      </div>
                      <div className="bg-background rounded-lg p-4 text-center">
                        <div className="flex justify-center gap-4 mb-2">
                          <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded-full bg-blue-500" />
                            <span className="text-lg font-bold">{genderBreakdown.male}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded-full bg-pink-500" />
                            <span className="text-lg font-bold">{genderBreakdown.female}</span>
                          </div>
                          {genderBreakdown.other > 0 && (
                            <div className="flex items-center gap-1.5">
                              <div className="w-3 h-3 rounded-full bg-purple-500" />
                              <span className="text-lg font-bold">{genderBreakdown.other}</span>
                            </div>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {genderBreakdown.male} boys · {genderBreakdown.female} girls
                          {genderBreakdown.other > 0 && ` · ${genderBreakdown.other} other`}
                        </p>
                      </div>
                      <div className="bg-background rounded-lg p-4 text-center">
                        <Clock className="w-8 h-8 text-primary mx-auto mb-2" />
                        <p className="text-sm font-medium">
                          {currentEvent.reveal_time
                            ? new Date(currentEvent.reveal_time).toLocaleString("en-IN", {
                                timeZone: "Asia/Kolkata"
                              }) + " IST"
                            : "Manual"}
                        </p>
                        <p className="text-sm text-muted-foreground">Reveal Time</p>
                      </div>
                    </div>

                    {/* Age Range Configuration */}
                    {currentEvent.status === "waiting" && (
                      <div className="bg-background rounded-lg p-4">
                        <Label className="text-sm font-medium mb-2 block">
                          Age Range Configuration
                        </Label>
                        <div className="flex items-center gap-4">
                          <Select
                            value={currentEvent.age_range.toString()}
                            onValueChange={updateAgeRange}
                          >
                            <SelectTrigger className="w-[180px] bg-card">
                              <SelectValue placeholder="Select age range" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">±1 year</SelectItem>
                              <SelectItem value="2">±2 years</SelectItem>
                              <SelectItem value="3">±3 years</SelectItem>
                              <SelectItem value="5">±5 years</SelectItem>
                              <SelectItem value="10">±10 years</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-sm text-muted-foreground">
                            Matches will be within ±{currentEvent.age_range} years of age
                          </p>
                        </div>
                      </div>
                    )}

                    {currentEvent.status === "waiting" && (
                      <Button
                        onClick={triggerReveal}
                        disabled={isTriggering}
                        className="w-full bg-primary hover:bg-primary/90 h-12 text-lg"
                      >
                        {isTriggering ? (
                          <>
                            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                            Running Matching...
                          </>
                        ) : (
                          <>
                            <Play className="w-5 h-5 mr-2" />
                            Trigger Reveal Now
                          </>
                        )}
                      </Button>
                    )}

                    {currentEvent.status === "revealed" && (
                      <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 text-center">
                        <p className="text-green-600 font-medium">✨ Matches have been revealed!</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {matchPairs.length} pairs matched
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ) : (
              <Card className="bg-card border-border">
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">
                    Create a new event or log in to an existing one
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Match Table */}
          <TabsContent value="matches">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Heart className="w-5 h-5 text-primary" />
                  Match Results
                </CardTitle>
                <CardDescription>Live view of all matches for {currentEvent?.name}</CardDescription>
              </CardHeader>
              <CardContent>
                {matchPairs.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Person A</TableHead>
                        <TableHead className="text-center">↔</TableHead>
                        <TableHead>Person B</TableHead>
                        <TableHead className="text-right">Compatibility</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {matchPairs.map((pair, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">{pair.personA.name}</TableCell>
                          <TableCell className="text-center">
                            <Heart className="w-4 h-4 text-primary mx-auto" />
                          </TableCell>
                          <TableCell className="font-medium">{pair.personB.name}</TableCell>
                          <TableCell className="text-right">
                            <span
                              className={`
                                px-2 py-1 rounded-full text-sm font-medium
                                ${
                                  pair.compatibilityScore >= 80
                                    ? "bg-green-500/20 text-green-600"
                                    : pair.compatibilityScore >= 60
                                    ? "bg-yellow-500/20 text-yellow-600"
                                    : "bg-orange-500/20 text-orange-600"
                                }
                              `}
                            >
                              {pair.compatibilityScore}%
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No matches yet. Trigger the reveal to see matches.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Responses Tab */}
          <TabsContent value="responses">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  Participant Responses
                </CardTitle>
                <CardDescription>
                  View individual responses for {currentEvent?.name}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingParticipants ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : participants.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Age</TableHead>
                        <TableHead>Gender</TableHead>
                        <TableHead>Orientation</TableHead>
                        <TableHead>City</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {participants.map((participant) => (
                        <TableRow key={participant.id}>
                          <TableCell className="font-medium">{participant.name}</TableCell>
                          <TableCell>{participant.age}</TableCell>
                          <TableCell>{participant.gender}</TableCell>
                          <TableCell>{participant.orientation}</TableCell>
                          <TableCell>{participant.city || "—"}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openResponsesModal(participant)}
                              className="gap-2"
                            >
                              <FileText className="w-4 h-4" />
                              Responses
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No participants have joined yet.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Create event */}
          <TabsContent value="create">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle>Create New Event</CardTitle>
                <CardDescription>Set up a new matching event</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="eventName">Event Name</Label>
                  <Input
                    id="eventName"
                    placeholder="Valentine's Night 2024"
                    value={newEvent.name}
                    onChange={e => setNewEvent(prev => ({ ...prev, name: e.target.value }))}
                    className="bg-card border-border"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="ageRange">Age Range (±years)</Label>
                    <Select
                      value={newEvent.ageRange}
                      onValueChange={value => setNewEvent(prev => ({ ...prev, ageRange: value }))}
                    >
                      <SelectTrigger className="bg-card border-border">
                        <SelectValue placeholder="Select age range" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">±1 year</SelectItem>
                        <SelectItem value="2">±2 years</SelectItem>
                        <SelectItem value="3">±3 years</SelectItem>
                        <SelectItem value="5">±5 years</SelectItem>
                        <SelectItem value="10">±10 years</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="revealTime">Reveal Time (optional)</Label>
                    <Input
                      id="revealTime"
                      type="datetime-local"
                      value={newEvent.revealTime}
                      onChange={e => setNewEvent(prev => ({ ...prev, revealTime: e.target.value }))}
                      className="bg-card border-border"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="adminPassword">Admin Password</Label>
                  <Input
                    id="adminPassword"
                    type="password"
                    placeholder="Required to manage this event"
                    value={newEvent.adminPassword}
                    onChange={e => setNewEvent(prev => ({ ...prev, adminPassword: e.target.value }))}
                    className="bg-card border-border"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Save this password! You'll need it to access this event later.
                  </p>
                </div>

                <Button
                  onClick={createEvent}
                  disabled={isCreating}
                  className="w-full bg-primary hover:bg-primary/90"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Create Event
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Responses Modal */}
      <ParticipantResponsesModal
        isOpen={responsesModalOpen}
        onClose={() => setResponsesModalOpen(false)}
        participant={selectedParticipant}
      />
    </div>
  );
}
