import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type Participant,
  type QuestionConfig,
  ALIGNMENT_CATEGORIES,
  COMPLEMENT_CATEGORIES,
} from "./scoring.ts";
import { matchParticipants } from "./matching.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { eventId, adminPassword } = await req.json();

    if (!adminPassword) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify admin password server-side using bcrypt (service role can read admin_password)
    const { data: isValid, error: authError } = await supabase.rpc("check_admin_password", {
      p_event_id: eventId,
      p_password: adminPassword,
    });

    if (authError || !isValid) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get event
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("*")
      .eq("id", eventId)
      .single();

    if (eventError || !event) {
      throw new Error("Event not found");
    }

    // Get questions with categories and options
    const { data: questions } = await supabase
      .from("questions")
      .select("id, question, category, options, is_ordinal, match_key")
      .eq("is_active", true);

    const questionConfigs = new Map<string, QuestionConfig>();
    if (questions) {
      questions.forEach((q: {
        id: string;
        question: string;
        category: string | null;
        options: string[];
        is_ordinal: boolean;
        match_key: string | null;
      }) => {
        const category = q.category || "neutral";
        let type: "alignment" | "complement" | "neutral" = "neutral";

        if (ALIGNMENT_CATEGORIES.includes(category)) {
          type = "alignment";
        } else if (COMPLEMENT_CATEGORIES.includes(category)) {
          type = "complement";
        }

        questionConfigs.set(q.id, {
          question: q.question,
          category,
          type,
          options: q.options || [],
          is_ordinal: q.is_ordinal || false,
          match_key: q.match_key || null,
        });
      });
    }

    // Get all unmatched participants
    const { data: participants, error: participantsError } = await supabase
      .from("participants")
      .select("*")
      .eq("event_id", eventId)
      .is("matched_to", null);

    if (participantsError) throw participantsError;

    console.log(`Matching ${participants?.length || 0} participants for event ${eventId}`);

    const unmatched = [...(participants || [])] as Participant[];

    // Greedy matching - assign highest mutual compatibility first, then run
    // a repair pass on whoever is left over (see matching.ts for why).
    const { matches, unmatched: stillUnmatched } = matchParticipants(
      unmatched,
      event.age_range,
      questionConfigs
    );

    console.log(
      `Matched ${matches.length / 2} pairs, ${stillUnmatched.length} participant(s) left unmatched`
    );

    // Update participants with matches
    for (const match of matches) {
      await supabase
        .from("participants")
        .update({
          matched_to: match.matchId,
          compatibility_score: match.score,
          compatibility_badge: match.badge,
        })
        .eq("id", match.id);
    }

    // Update event status to revealed
    await supabase
      .from("events")
      .update({ status: "revealed" })
      .eq("id", eventId);

    return new Response(
      JSON.stringify({ success: true, matchedPairs: matches.length / 2 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Matching error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
