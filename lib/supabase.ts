import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

// Types pour TypeScript
export interface Room {
  id: string;
  code: string;
  name: string;
  host_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Player {
  id: string;
  pseudo: string;
  room_id: string;
  score: number;
  is_connected: boolean;
  joined_at: string;
}

export interface Question {
  id: string;
  room_id: string;
  text: string;
  correct_answer: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Answer {
  id: string;
  player_id: string;
  question_id: string;
  text: string;
  response_time: number;
  is_correct: boolean;
  submitted_at: string;
  player?: Player;
}

// Utilitaires
export const generateRoomCode = (): string => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};