import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QuestionCard } from "@/components/QuestionCard";
import { HobbySelector } from "@/components/HobbySelector";

import { ArrowLeft, ArrowRight, Loader2, Instagram } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { generateSessionToken, saveSession, getSession } from "@/lib/session";
import type { Question, Hobby, FormStep, Answer } from "@/lib/types";
const GENDERS = ["Man", "Woman", "Non-binary", "Other"];
const ORIENTATIONS = ["Straight", "Gay", "Lesbian", "Bisexual", "Pansexual", "Other"];
const SHOW_ME_OPTIONS = ["Men", "Women", "Everyone"];
export default function ProfileForm() {
  const {
    eventId
  } = useParams();
  const navigate = useNavigate();
  const [step, setStep] = useState<FormStep>("basics");
  const [isLoading, setIsLoading] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [hobbies, setHobbies] = useState<Hobby[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  // Form data
  const [formData, setFormData] = useState({
    name: "",
    age: "",
    city: "",
    instagram: "",
    gender: "",
    orientation: "",
    showMe: [] as string[],
    hobbies: [] as string[],
    answers: [] as Answer[]
  });
  useEffect(() => {
    // Check if user already registered for this event
    const session = getSession();
    if (session && session.eventId === eventId) {
      navigate(`/waiting/${eventId}`);
      return;
    }

    // Fetch questions and hobbies
    fetchData();
  }, [eventId, navigate]);
  const fetchData = async () => {
    try {
      const [questionsRes, hobbiesRes] = await Promise.all([supabase.from("questions").select("*").order("sort_order"), supabase.from("hobbies").select("*").order("sort_order")]);
      if (questionsRes.data) {
        setQuestions(questionsRes.data.map(q => ({
          ...q,
          options: q.options as string[]
        })));
      }
      if (hobbiesRes.data) setHobbies(hobbiesRes.data);
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  };
  const updateFormData = (key: keyof typeof formData, value: string | string[] | Answer[]) => {
    setFormData(prev => ({
      ...prev,
      [key]: value
    }));
  };
  const toggleShowMe = (option: string) => {
    setFormData(prev => ({
      ...prev,
      showMe: prev.showMe.includes(option) ? prev.showMe.filter(o => o !== option) : [...prev.showMe, option]
    }));
  };
  const toggleHobby = (hobby: string) => {
    setFormData(prev => ({
      ...prev,
      hobbies: prev.hobbies.includes(hobby) ? prev.hobbies.filter(h => h !== hobby) : [...prev.hobbies, hobby]
    }));
  };
  const handleAnswerQuestion = (answer: string) => {
    const question = questions[currentQuestionIndex];
    const newAnswers = [...formData.answers];
    const existingIndex = newAnswers.findIndex(a => a.question_id === question.id);
    if (existingIndex >= 0) {
      newAnswers[existingIndex] = {
        question_id: question.id,
        answer
      };
    } else {
      newAnswers.push({
        question_id: question.id,
        answer
      });
    }
    updateFormData("answers", newAnswers);

    // Auto-advance to next question
    if (currentQuestionIndex < questions.length - 1) {
      setTimeout(() => setCurrentQuestionIndex(prev => prev + 1), 300);
    }
  };
  const getCurrentAnswer = () => {
    if (!questions[currentQuestionIndex]) return null;
    const answer = formData.answers.find(a => a.question_id === questions[currentQuestionIndex].id);
    return answer?.answer || null;
  };
  const validateBasics = () => {
    if (!formData.name.trim()) {
      toast.error("Please enter your name");
      return false;
    }
    const age = parseInt(formData.age);
    if (!age || age < 15 || age > 99) {
      toast.error("Please enter a valid age (15-99)");
      return false;
    }
    if (!formData.gender) {
      toast.error("Please select your gender");
      return false;
    }
    return true;
  };
  const validatePreferences = () => {
    if (!formData.orientation) {
      toast.error("Please select your orientation");
      return false;
    }
    if (formData.showMe.length === 0) {
      toast.error("Please select who you'd like to match with");
      return false;
    }
    return true;
  };
  const validateHobbies = () => {
    if (formData.hobbies.length < 3) {
      toast.error("Please select at least 3 hobbies");
      return false;
    }
    return true;
  };
  const handleNext = () => {
    if (step === "basics" && validateBasics()) {
      setStep("preferences");
    } else if (step === "preferences" && validatePreferences()) {
      setStep("hobbies");
    } else if (step === "hobbies" && validateHobbies()) {
      setStep("questions");
    }
  };
  const handleBack = () => {
    if (step === "preferences") setStep("basics");else if (step === "hobbies") setStep("preferences");else if (step === "questions") {
      if (currentQuestionIndex > 0) {
        setCurrentQuestionIndex(prev => prev - 1);
      } else {
        setStep("hobbies");
      }
    }
  };
  const handleSubmit = async () => {
    if (formData.answers.length < questions.length) {
      toast.error("Please answer all questions");
      return;
    }
    setIsLoading(true);
    try {
      const sessionToken = generateSessionToken();
      const {
        data: participant,
        error
      } = await supabase.from("participants").insert([{
        event_id: eventId!,
        session_token: sessionToken,
        name: formData.name.trim(),
        age: parseInt(formData.age),
        city: formData.city.trim() || null,
        instagram: formData.instagram.trim() || null,
        gender: formData.gender,
        orientation: formData.orientation,
        show_me: formData.showMe,
        hobbies: formData.hobbies,
        answers: formData.answers as unknown as {
          question_id: string;
          answer: string;
        }[]
      }]).select().single();
      if (error) throw error;
      saveSession({
        participantId: participant.id,
        sessionToken,
        eventId: eventId!,
        eventCode: ""
      });
      toast.success("You're in! Get ready for your match 💕");
      navigate(`/waiting/${eventId}`);
    } catch (error) {
      console.error("Error submitting:", error);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };
  const renderStep = () => {
    switch (step) {
      case "basics":
        return <motion.div key="basics" initial={{
          opacity: 0,
          x: 50
        }} animate={{
          opacity: 1,
          x: 0
        }} exit={{
          opacity: 0,
          x: -50
        }} className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="font-display text-3xl font-bold mb-2">
                Let's start with the basics
              </h2>
              <p className="text-muted-foreground">Tell us a bit about yourself</p>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Your name</Label>
                <Input id="name" placeholder="What should we call you?" value={formData.name} onChange={e => updateFormData("name", e.target.value)} className="bg-card border-border h-12" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="age">Age</Label>
                  <Input id="age" type="number" placeholder="15" min="15" max="99" value={formData.age} onChange={e => updateFormData("age", e.target.value)} className="bg-card border-border h-12" />
                </div>
                <div>
                  <Label htmlFor="city">City / Institution</Label>
                  <Input id="city" placeholder="Mumbai" value={formData.city} onChange={e => updateFormData("city", e.target.value)} className="bg-card border-border h-12" />
                </div>
              </div>

              <div>
                <Label htmlFor="instagram" className="flex items-center gap-2">
                  <Instagram className="w-4 h-4" />
                  Instagram (optional)
                </Label>
                <Input id="instagram" placeholder="@yourhandle" value={formData.instagram} onChange={e => updateFormData("instagram", e.target.value)} className="bg-card border-border h-12" />
                <p className="text-xs text-muted-foreground mt-1">
                  Shared only with your match 💕
                </p>
              </div>

              <div>
                <Label>I am a...</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {GENDERS.map(g => <Button key={g} type="button" variant={formData.gender === g ? "default" : "outline"} onClick={() => updateFormData("gender", g)} className={formData.gender === g ? "bg-primary" : "border-border"}>
                      {g}
                    </Button>)}
                </div>
              </div>
            </div>
          </motion.div>;
      case "preferences":
        return <motion.div key="preferences" initial={{
          opacity: 0,
          x: 50
        }} animate={{
          opacity: 1,
          x: 0
        }} exit={{
          opacity: 0,
          x: -50
        }} className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="font-display text-3xl font-bold mb-2">
                Your preferences
              </h2>
              <p className="text-muted-foreground">Help us find your perfect match</p>
            </div>

            <div className="space-y-6">
              <div>
                <Label>I am..</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {ORIENTATIONS.map(o => <Button key={o} type="button" variant={formData.orientation === o ? "default" : "outline"} onClick={() => updateFormData("orientation", o)} className={formData.orientation === o ? "bg-primary" : "border-border"}>
                      {o}
                    </Button>)}
                </div>
              </div>

              <div>
                <Label>Show me...</Label>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {SHOW_ME_OPTIONS.map(o => <Button key={o} type="button" variant={formData.showMe.includes(o) ? "default" : "outline"} onClick={() => toggleShowMe(o)} className={formData.showMe.includes(o) ? "bg-primary" : "border-border"}>
                      {o}
                    </Button>)}
                </div>
              </div>
            </div>
          </motion.div>;
      case "hobbies":
        return <motion.div key="hobbies" initial={{
          opacity: 0,
          x: 50
        }} animate={{
          opacity: 1,
          x: 0
        }} exit={{
          opacity: 0,
          x: -50
        }} className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="font-display text-3xl font-bold mb-2">
                What do you love?
              </h2>
              <p className="text-muted-foreground">Select your favorite hobbies</p>
            </div>

            <HobbySelector hobbies={hobbies} selected={formData.hobbies} onToggle={toggleHobby} />
          </motion.div>;
      case "questions":
        return <motion.div key="questions" initial={{
          opacity: 0,
          x: 50
        }} animate={{
          opacity: 1,
          x: 0
        }} exit={{
          opacity: 0,
          x: -50
        }}>
            <div className="text-center mb-8">
              <h2 className="font-display text-3xl font-bold mb-2">
                Vibe check ✨
              </h2>
              <p className="text-muted-foreground">Quick questions to find your match</p>
            </div>

            {questions[currentQuestionIndex] && <QuestionCard question={questions[currentQuestionIndex]} selectedAnswer={getCurrentAnswer()} onSelect={handleAnswerQuestion} currentIndex={currentQuestionIndex} totalQuestions={questions.length} />}
          </motion.div>;
    }
  };
  const canProceed = () => {
    if (step === "questions") {
      return formData.answers.length === questions.length;
    }
    return true;
  };
  const isLastQuestion = step === "questions" && currentQuestionIndex === questions.length - 1;
  return <div className="min-h-screen flex flex-col p-6 relative">
      {/* Back button */}
      <button
        onClick={() => navigate("/join")}
        className="absolute top-6 left-6 text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2 text-sm z-10"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
        Back
      </button>

      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[100px]" />
      </div>

      {/* Header */}
      <motion.div initial={{
      opacity: 0,
      y: -20
    }} animate={{
      opacity: 1,
      y: 0
    }} className="flex items-center justify-center gap-2 mb-8">
        <span className="font-display text-2xl font-bold text-primary">playingcupid</span>
      </motion.div>

      {/* Form content */}
      <div className="flex-1 flex flex-col justify-center max-w-lg mx-auto w-full">
        <AnimatePresence mode="wait">{renderStep()}</AnimatePresence>
      </div>

      {/* Navigation */}
      <motion.div initial={{
      opacity: 0,
      y: 20
    }} animate={{
      opacity: 1,
      y: 0
    }} className="flex justify-between gap-4 mt-8 max-w-lg mx-auto w-full">
        <Button type="button" variant="ghost" onClick={handleBack} disabled={step === "basics"} className="text-muted-foreground">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        {step !== "questions" ? <Button type="button" onClick={handleNext} className="bg-primary hover:bg-primary/90 shadow-button">
            Next
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button> : isLastQuestion && canProceed() ? <Button type="button" onClick={handleSubmit} disabled={isLoading} className="bg-primary hover:bg-primary/90 shadow-button">
            {isLoading ? <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Submitting...
              </> : <>
                Find My Match
                <ArrowRight className="w-4 h-4 ml-2" />
              </>}
          </Button> : null}
      </motion.div>
    </div>;
}