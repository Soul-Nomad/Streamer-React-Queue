import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

Deno.serve(async (req) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? '';

    // Extracao segura do body
    const body = await req.json().catch(() => ({}));
    const { room_id, video_url, user_id } = body;

    if (!room_id || !video_url) {
      throw new Error('room_id ou video_url não foram fornecidos no corpo da requisição');
    }

    // Identificar usuário via Header JWT nativamente para evitar bugs do getUser
    let userId = user_id;
    let viewerTwitchId = userId;
    
    const authHeader = req.headers.get('Authorization') || '';
    if (authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const payloadBase64 = token.split('.')[1];
        // decoficar JWT manualmente (básico)
        const payloadStr = atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/'));
        const payload = JSON.parse(payloadStr);
        userId = payload.sub || userId;
        viewerTwitchId = payload.user_metadata?.provider_id || payload.user_metadata?.sub || userId;
      } catch (e) {
        console.warn('Falha ao decodificar JWT manualmente:', e);
      }
    }

    if (!userId) {
      throw new Error('Usuário não autenticado ou faltando no payload');
    }

    // Bypass RLS para inserção segura na nuvem
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    
    // Inserir
    const { data: newVideo, error: insertError } = await supabaseAdmin
      .from('videos')
      .insert({
        room_id,
        submitted_by: userId,
        twitch_user_id: String(viewerTwitchId),
        video_url,
        status: 'pending',
        priority_score: 0
      })
      .select()
      .single();

    if (insertError) {
      console.error('[Insert Error]', insertError);
      throw new Error(insertError.message);
    }

    return new Response(JSON.stringify({ success: true, video: newVideo }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error('[Catch Error]', error);
    return new Response(JSON.stringify({ error: error.message || 'Erro interno Edge Function' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});

