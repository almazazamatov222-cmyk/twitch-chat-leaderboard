import { AppTokenAuthProvider } from '@twurple/auth';
import { ApiClient } from '@twurple/api';
import { EventSubWsListener } from '@twurple/eventsub-ws';
import { ChatClient } from '@twurple/chat';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || '';
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
  console.error('Missing required environment variables. Ensure SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET are set.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const authProvider = new AppTokenAuthProvider(TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET);
const apiClient = new ApiClient({ authProvider });
const listener = new EventSubWsListener({ apiClient });
const chatClient = new ChatClient(); // Anonymous chat client

// State
const activeSessions = new Map<string, string>(); // twitch_username -> session_id
const userSettings = new Map<string, any>(); // twitch_username -> settings object

// Message batching
interface Batch {
  [userId: string]: { username: string; count: number };
}
const messageBatches = new Map<string, Batch>(); // session_id -> Batch

async function startSession(userId: string, twitchId: string, twitchUsername: string) {
  const username = twitchUsername.toLowerCase();
  try {
    // End existing active sessions for this user
    await supabase
      .from('sessions')
      .update({ status: 'completed', ended_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('status', 'active');

    // Create new session
    const { data, error } = await supabase
      .from('sessions')
      .insert({ user_id: userId, status: 'active' })
      .select('id')
      .single();

    if (error || !data) {
      console.error(`Failed to create session for ${twitchUsername}:`, error);
      return;
    }

    const sessionId = data.id;
    activeSessions.set(username, sessionId);
    messageBatches.set(sessionId, {});

    // Join chat if not already joined
    if (!chatClient.currentChannels.includes(`#${username}`)) {
      try {
        await chatClient.join(username);
        console.log(`Joined chat: ${username}`);
      } catch (err) {
        console.error(`Error joining chat ${username}:`, err);
      }
    }
    
    console.log(`Session started for ${username} (${sessionId})`);
  } catch (err) {
    console.error(`startSession error for ${username}:`, err);
  }
}

async function endSession(userId: string, twitchId: string, twitchUsername: string) {
  const username = twitchUsername.toLowerCase();
  try {
    await supabase
      .from('sessions')
      .update({ status: 'completed', ended_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('status', 'active');

    const sessionId = activeSessions.get(username);
    if (sessionId) {
      messageBatches.delete(sessionId);
    }
    activeSessions.delete(username);

    // Part chat
    if (chatClient.currentChannels.includes(`#${username}`)) {
      chatClient.part(username);
      console.log(`Parted chat: ${username}`);
    }

    console.log(`Session ended for ${username}`);
  } catch (err) {
    console.error(`endSession error for ${username}:`, err);
  }
}

// Subscribe to a specific streamer
async function subscribeToStreamer(userId: string, twitchId: string, twitchUsername: string, settings: any) {
  const username = twitchUsername.toLowerCase();
  userSettings.set(username, settings);

  // Setup EventSub
  listener.onStreamOnline(twitchId, async (e) => {
    console.log(`Stream online event received for ${username}`);
    await startSession(userId, twitchId, username);
  });

  listener.onStreamOffline(twitchId, async (e) => {
    console.log(`Stream offline event received for ${username}`);
    await endSession(userId, twitchId, username);
  });

  // Check current status
  const stream = await apiClient.streams.getStreamByUserId(twitchId);
  if (stream) {
    console.log(`${username} is currently live. Starting session.`);
    await startSession(userId, twitchId, username);
  } else {
    console.log(`${username} is offline.`);
    await endSession(userId, twitchId, username);
  }
}

async function flushBatches() {
  for (const [sessionId, batch] of messageBatches.entries()) {
    if (Object.keys(batch).length === 0) continue;

    // We take a snapshot and clear the batch to prevent concurrent modification loss
    const currentBatch = { ...batch };
    messageBatches.set(sessionId, {});

    for (const [userId, data] of Object.entries(currentBatch)) {
      try {
        await supabase.rpc('increment_message_stat', {
          p_session_id: sessionId,
          p_twitch_user_id: userId,
          p_twitch_username: data.username,
          p_increment: data.count,
          p_overlay_token: null // Using service role, so token validation bypass might be needed or handled in RPC
        });
        
        // Also trigger real-time highlight if enabled
        const settings = Array.from(userSettings.values()).find(s => activeSessions.get(s.twitch_username.toLowerCase()) === sessionId);
        if (settings && settings.highlight_new) {
           // We broadcast a highlight event
           supabase.channel(`chat_sync_${sessionId}`).send({
             type: 'broadcast',
             event: 'highlight',
             payload: { userId }
           });
        }
      } catch (err) {
        console.error('Failed to increment stat in batch', err);
      }
    }
  }
}

async function init() {
  console.log('Starting Twitch Backend Worker...');

  await chatClient.connect();
  listener.start();
  console.log('Connected to Twitch Chat and EventSub WS');

  // Fetch all configured users
  const { data: users, error } = await supabase
    .from('settings')
    .select('*')
    .not('twitch_id', 'is', null);

  if (error || !users) {
    console.error('Failed to fetch users from Supabase:', error);
    process.exit(1);
  }

  console.log(`Found ${users.length} configured users.`);

  for (const user of users) {
    if (user.twitch_id && user.twitch_username) {
      await subscribeToStreamer(user.user_id, user.twitch_id, user.twitch_username, user);
    }
  }

  // Listen for settings changes to update user cache or add new streamers
  supabase
    .channel('worker_settings_listener')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, async (payload) => {
      const newRow = payload.new as any;
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        if (newRow.twitch_id && newRow.twitch_username) {
          const oldUsername = (payload.old as any)?.twitch_username?.toLowerCase();
          const newUsername = newRow.twitch_username.toLowerCase();
          
          if (oldUsername && oldUsername !== newUsername && activeSessions.has(oldUsername)) {
             // username changed, stop old
             await endSession(newRow.user_id, newRow.twitch_id, oldUsername);
          }
          
          userSettings.set(newUsername, newRow);
          // If we haven't subscribed to this stream yet, or we need to restart
          if (!activeSessions.has(newUsername)) {
            await subscribeToStreamer(newRow.user_id, newRow.twitch_id, newRow.twitch_username, newRow);
          }
        }
      }
    })
    .subscribe();

  // Handle chat messages
  chatClient.onMessage((channel, user, text, msg) => {
    const channelName = channel.replace('#', '').toLowerCase();
    const sessionId = activeSessions.get(channelName);
    
    if (!sessionId) return;
    const settings = userSettings.get(channelName);
    if (!settings) return;

    // Filter logic
    if (settings.ignore_commands && text.startsWith('!')) return;
    if (settings.ignore_streamer && msg.userInfo.displayName.toLowerCase() === channelName) return;
    if (settings.ignore_mods && msg.userInfo.isMod) return;
    if (settings.ignore_vips && msg.userInfo.isVip) return;
    if (text.length < (settings.min_message_length || 1)) return;
    if ((settings.excluded_users || []).includes(msg.userInfo.displayName.toLowerCase())) return;
    if ((settings.bot_users || []).includes(msg.userInfo.displayName.toLowerCase())) return;

    const userId = msg.userInfo.userId;
    const displayName = msg.userInfo.displayName;

    const batch = messageBatches.get(sessionId);
    if (batch) {
      if (!batch[userId]) {
        batch[userId] = { username: displayName, count: 0 };
      }
      batch[userId].count += 1;
    }
  });

  // Batch flusher interval (every 2 seconds)
  setInterval(flushBatches, 2000);
}

init().catch(console.error);
