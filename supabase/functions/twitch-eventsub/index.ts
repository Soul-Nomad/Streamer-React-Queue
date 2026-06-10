import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const TWITCH_EVENTSUB_SECRET = Deno.env.get('TWITCH_EVENTSUB_SECRET') || 'your-secret-hook-key';

Deno.serve(async (req) => {
  try {
    const bodyText = await req.text();
    const messageType = req.headers.get('Twitch-Eventsub-Message-Type');

    // 2. Handle Challenge (Webhook Verification)
    if (messageType === 'webhook_callback_verification') {
      const body = JSON.parse(bodyText);
      return new Response(body.challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }

    // 3. Process Events
    if (messageType === 'notification') {
      const body = JSON.parse(bodyText);
      const eventType = req.headers.get('Twitch-Eventsub-Subscription-Type');
      const event = body.event;

      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
      const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

      if (eventType === 'channel.ban' || eventType === 'channel.timeout') {
        const broadcasterId = event.broadcaster_user_id;
        const bannedUserId = event.user_id;

        // Auto-remove banned viewer's videos
        await supabaseAdmin
          .from('videos')
          .update({ status: 'removed' })
          .eq('twitch_user_id', bannedUserId)
          .in('status', ['pending', 'approved']);
      }

      if (eventType === 'channel.channel_points_custom_reward_redemption.add') {
        // Implement reward skipping logic
      }

      return new Response('Event processed', { status: 200 });
    }

    return new Response('OK', { status: 200 });
  } catch (err: any) {
    console.error(err);
    return new Response('Internal Server Error', { status: 500 });
  }
});
