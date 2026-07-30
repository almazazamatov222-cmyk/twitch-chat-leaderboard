'use client';

import { supabase } from '@/lib/supabase/client';
import { useState } from 'react';
import { LogIn } from 'lucide-react';

export default function LoginButton() {
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'twitch',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          scopes: 'user:read:chat user:bot channel:bot'
        }
      });
      if (error) throw error;
    } catch (error: Error | unknown) {
      console.error('Error logging in:', error instanceof Error ? error.message : String(error));
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleLogin}
      disabled={loading}
      className="flex items-center gap-2 px-6 py-3 bg-[#9146FF] hover:bg-[#772ce8] text-white rounded-lg font-medium transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
    >
      <LogIn size={20} />
      {loading ? 'Подключение...' : 'Войти через Twitch'}
    </button>
  );
}
