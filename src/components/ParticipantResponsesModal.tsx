import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import type { Answer, Question } from "@/lib/types";

interface ParticipantResponsesModalProps {
  isOpen: boolean;
  onClose: () => void;
  participant: {
    id: string;
    name: string;
    age: number;
    gender: string;
    orientation: string;
    city: string | null;
    hobbies: string[];
    answers: Answer[];
  } | null;
}

export function ParticipantResponsesModal({
  isOpen,
  onClose,
  participant,
}: ParticipantResponsesModalProps) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      fetchQuestions();
    }
  }, [isOpen]);

  const fetchQuestions = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("questions")
      .select("*")
      .eq("is_active", true)
      .order("sort_order");
    
    if (data) {
      setQuestions(data as Question[]);
    }
    setLoading(false);
  };

  const getAnswerForQuestion = (questionId: string): string | null => {
    if (!participant?.answers) return null;
    const answer = participant.answers.find((a) => a.question_id === questionId);
    return answer?.answer || null;
  };

  const getCategoryColor = (category: string | null): string => {
    switch (category) {
      case "personality":
        return "bg-purple-500/20 text-purple-600";
      case "communication":
        return "bg-blue-500/20 text-blue-600";
      case "emotional_depth":
        return "bg-pink-500/20 text-pink-600";
      case "values":
        return "bg-amber-500/20 text-amber-600";
      case "relationship":
        return "bg-rose-500/20 text-rose-600";
      case "conflict":
        return "bg-orange-500/20 text-orange-600";
      case "lifestyle":
        return "bg-green-500/20 text-green-600";
      case "connection":
        return "bg-cyan-500/20 text-cyan-600";
      case "dating":
        return "bg-indigo-500/20 text-indigo-600";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  if (!participant) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {participant.name}'s Responses
          </DialogTitle>
          <DialogDescription className="flex flex-wrap gap-2 mt-2">
            <Badge variant="outline">{participant.age} years old</Badge>
            <Badge variant="outline">{participant.gender}</Badge>
            <Badge variant="outline">{participant.orientation}</Badge>
            {participant.city && (
              <Badge variant="outline">{participant.city}</Badge>
            )}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[60vh] pr-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Hobbies Section */}
              <div className="bg-muted/30 rounded-lg p-4">
                <h3 className="font-medium mb-2 text-sm text-muted-foreground">
                  Selected Hobbies
                </h3>
                <div className="flex flex-wrap gap-2">
                  {participant.hobbies.length > 0 ? (
                    participant.hobbies.map((hobby) => (
                      <Badge key={hobby} variant="secondary">
                        {hobby}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-muted-foreground text-sm">
                      No hobbies selected
                    </span>
                  )}
                </div>
              </div>

              {/* Questions & Answers */}
              <div className="space-y-4">
                <h3 className="font-medium text-sm text-muted-foreground">
                  Question Responses ({questions.length} questions)
                </h3>
                {questions.map((question, index) => {
                  const answer = getAnswerForQuestion(question.id);
                  return (
                    <div
                      key={question.id}
                      className="border border-border rounded-lg p-4"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="text-xs text-muted-foreground">
                          Q{index + 1}
                        </span>
                        <Badge
                          className={`text-xs ${getCategoryColor(question.category)}`}
                        >
                          {question.category || "general"}
                        </Badge>
                      </div>
                      <p className="font-medium text-sm mb-2">
                        {question.question}
                      </p>
                      {answer ? (
                        <div className="bg-primary/10 rounded-md px-3 py-2">
                          <span className="text-primary font-medium text-sm">
                            {answer}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm italic">
                          Not answered
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
