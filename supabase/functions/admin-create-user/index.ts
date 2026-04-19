import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Role = "admin" | "manager" | "agent" | "customer";
type Action = "create" | "update" | "delete" | "revoke_role";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "Missing auth" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData.user) return json({ error: "Invalid token" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userData.user.id, _role: "admin" });
    const { data: isManager } = await admin.rpc("has_role", { _user_id: userData.user.id, _role: "manager" });

    if (!isAdmin && !isManager) return json({ error: "Forbidden: admin or manager only" }, 403);

    const body = await req.json();
    const action: Action = body.action ?? "create";

    // ------------- DELETE USER -------------
    if (action === "delete") {
      if (!isAdmin) return json({ error: "Only admins can delete users" }, 403);
      const target = body.user_id as string;
      if (!target) return json({ error: "user_id required" }, 400);
      if (target === userData.user.id) return json({ error: "You cannot delete yourself" }, 400);
      const { error: delErr } = await admin.auth.admin.deleteUser(target);
      if (delErr) return json({ error: delErr.message }, 400);
      return json({ ok: true });
    }

    // ------------- REVOKE ROLE -------------
    if (action === "revoke_role") {
      if (!isAdmin) return json({ error: "Only admins can revoke roles" }, 403);
      const target = body.user_id as string;
      const role = body.role as Role;
      if (!target || !role) return json({ error: "user_id and role required" }, 400);
      if (target === userData.user.id && role === "admin") {
        return json({ error: "You cannot remove your own admin role" }, 400);
      }
      const { error: rErr } = await admin.from("user_roles").delete().eq("user_id", target).eq("role", role);
      if (rErr) return json({ error: rErr.message }, 400);
      return json({ ok: true });
    }

    // ------------- UPDATE USER -------------
    if (action === "update") {
      const target = body.user_id as string;
      if (!target) return json({ error: "user_id required" }, 400);

      // Manager may only edit their own agents
      if (!isAdmin) {
        const { data: prof } = await admin.from("profiles").select("manager_id").eq("user_id", target).maybeSingle();
        if (!prof || prof.manager_id !== userData.user.id) {
          return json({ error: "Managers can only edit their own agents" }, 403);
        }
      }

      const profileUpdate: Record<string, unknown> = {};
      if (body.full_name !== undefined) profileUpdate.full_name = body.full_name;
      if (body.phone !== undefined) profileUpdate.phone = body.phone || null;
      if (body.branch_name !== undefined) profileUpdate.branch_name = body.branch_name || null;
      if (body.branch_phone !== undefined) profileUpdate.branch_phone = body.branch_phone || null;
      if (body.shift1_name !== undefined) profileUpdate.shift1_name = body.shift1_name || null;
      if (body.shift2_name !== undefined) profileUpdate.shift2_name = body.shift2_name || null;

      if (Object.keys(profileUpdate).length > 0) {
        const { error: pErr } = await admin.from("profiles").update(profileUpdate).eq("user_id", target);
        if (pErr) return json({ error: pErr.message }, 400);
      }

      if (body.password && typeof body.password === "string" && body.password.length >= 6) {
        if (!isAdmin) return json({ error: "Only admins can reset passwords" }, 403);
        const { error: pwErr } = await admin.auth.admin.updateUserById(target, { password: body.password });
        if (pwErr) return json({ error: pwErr.message }, 400);
      }

      return json({ ok: true });
    }

    // ------------- CREATE USER (default) -------------
    const {
      email, password, full_name, phone, role,
      branch_name, branch_phone, shift1_name, shift2_name,
    } = body as {
      email: string; password: string; full_name?: string; phone?: string; role: Role;
      branch_name?: string; branch_phone?: string; shift1_name?: string; shift2_name?: string;
    };

    if (!email || !password || !role) return json({ error: "email, password, role required" }, 400);

    if (!isAdmin && role !== "agent") {
      return json({ error: "Managers can only create agents" }, 403);
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name ?? "" },
    });
    if (createErr || !created.user) return json({ error: createErr?.message ?? "Create failed" }, 400);

    const newId = created.user.id;
    const managerId = role === "agent" ? userData.user.id : null;

    const profileUpdate: Record<string, unknown> = {};
    if (full_name !== undefined) profileUpdate.full_name = full_name;
    if (phone !== undefined) profileUpdate.phone = phone || null;
    if (role === "agent") {
      profileUpdate.branch_name = branch_name ?? null;
      profileUpdate.branch_phone = branch_phone ?? null;
      profileUpdate.shift1_name = shift1_name ?? null;
      profileUpdate.shift2_name = shift2_name ?? null;
      profileUpdate.manager_id = managerId;
    }

    if (Object.keys(profileUpdate).length > 0) {
      await admin.from("profiles").update(profileUpdate).eq("user_id", newId);
    }

    if (role !== "customer") {
      await admin.from("user_roles").insert({ user_id: newId, role });
    }

    return json({ ok: true, user_id: newId });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
