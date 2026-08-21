import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Identify the caller from their JWT
    const authHeader = req.headers.get('Authorization') ?? '';
    const callerClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: 'Not authenticated' }, 401);
    const callerId = userData.user.id;

    // Admin client (service role) for privileged checks + the actual update
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    // Verify caller has admin or super_admin role
    const { data: roles, error: roleErr } = await admin
      .from('user_roles').select('role').eq('user_id', callerId);
    if (roleErr) return json({ error: 'Role check failed' }, 500);
    const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === 'admin' || r.role === 'super_admin');
    if (!isAdmin) return json({ error: 'Only admins can reset passwords' }, 403);

    const { targetUserId, newPassword } = await req.json();
    if (!targetUserId || !newPassword || String(newPassword).length < 6) {
      return json({ error: 'targetUserId and a password of at least 6 characters are required' }, 400);
    }

    const { error: updErr } = await admin.auth.admin.updateUserById(targetUserId, {
      password: String(newPassword),
    });
    if (updErr) return json({ error: updErr.message }, 400);

    return json({ success: true });
  } catch (e) {
    return json({ error: (e as Error).message ?? 'Unexpected error' }, 500);
  }
});
