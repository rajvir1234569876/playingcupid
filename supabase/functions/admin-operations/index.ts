import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Get user from token
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;
    const { action, ...params } = await req.json();

    // Special action: auto-grant admin role (self-grant on first login)
    if (action === "auto-grant-admin") {
      // Check if user already has admin role
      const { data: existingRole } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();

      if (existingRole) {
        return new Response(
          JSON.stringify({ success: true, message: "Already admin" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Grant admin role
      const { error: insertError } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: userId, role: "admin" });

      if (insertError) throw insertError;

      // Log the action
      await supabaseAdmin.from("admin_audit_log").insert({
        admin_user_id: userId,
        action: "self-grant-admin",
        target_type: "user",
        target_id: userId,
        metadata: { email: user.email },
      });

      return new Response(
        JSON.stringify({ success: true, message: "Admin role granted" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // For all other actions, require existing admin role
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    switch (action) {
      case "delete-participant": {
        const { participantId, eventId } = params;
        if (!participantId || !eventId) {
          return new Response(
            JSON.stringify({ error: "participantId and eventId required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: participant } = await supabaseAdmin
          .from("participants")
          .select("id, name, event_id")
          .eq("id", participantId)
          .eq("event_id", eventId)
          .single();

        if (!participant) {
          return new Response(
            JSON.stringify({ error: "Participant not found" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { error: deleteError } = await supabaseAdmin
          .from("participants")
          .delete()
          .eq("id", participantId);

        if (deleteError) throw deleteError;

        await supabaseAdmin.from("admin_audit_log").insert({
          admin_user_id: userId,
          action: "delete",
          target_type: "participant",
          target_id: participantId,
          metadata: { participant_name: participant.name, event_id: eventId },
        });

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "list-all-events": {
        const { data: events, error: eventsError } = await supabaseAdmin
          .from("events")
          .select("id, name, code, status, created_at, reveal_time")
          .order("created_at", { ascending: false });

        if (eventsError) throw eventsError;

        // Get participant counts for each event
        const eventsWithCounts = await Promise.all(
          (events || []).map(async (event) => {
            const { count } = await supabaseAdmin
              .from("participants")
              .select("*", { count: "exact", head: true })
              .eq("event_id", event.id);
            return { ...event, participant_count: count || 0 };
          })
        );

        return new Response(
          JSON.stringify({ events: eventsWithCounts }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: "Unknown action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error) {
    console.error("Admin operation error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
