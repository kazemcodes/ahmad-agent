// Shared types mirroring the PHP array shapes (Bale Update/Message, etc.)

export interface BaleUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  [k: string]: unknown;
}

export interface BaleChat {
  id: number;
  type?: 'private' | 'group' | 'channel' | string;
  title?: string;
  [k: string]: unknown;
}

export interface BalePhotoSize {
  file_id?: string;
  file_size?: number;
  [k: string]: unknown;
}

export interface BaleDocument {
  file_id?: string;
  file_name?: string;
  file_size?: number;
  [k: string]: unknown;
}

export interface BaleMessage {
  message_id?: number;
  from?: BaleUser;
  chat?: BaleChat;
  date?: number;
  text?: string;
  caption?: string;
  photo?: BalePhotoSize[];
  document?: BaleDocument;
  sticker?: unknown;
  voice?: { file_id?: string; file_size?: number; [k: string]: unknown };
  reply_to_message?: { from?: BaleUser; [k: string]: unknown };
  [k: string]: unknown;
}

export interface CallbackQuery {
  id?: string;
  data?: string;
  from?: BaleUser;
  message?: BaleMessage;
  [k: string]: unknown;
}

export interface BaleUpdate {
  update_id: number;
  message?: BaleMessage;
  edited_message?: BaleMessage;
  callback_query?: CallbackQuery;
  [k: string]: unknown;
}

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string | unknown;
}

export interface ChatCompletionResult {
  choices?: Array<{
    message?: { content?: unknown };
    delta?: { content?: unknown };
  }>;
  usage?: Record<string, unknown>;
  [k: string]: unknown;
}

export interface ImageResult {
  url?: string;
  b64_json?: string;
  [k: string]: unknown;
}

export interface ImageJobRow {
  id: number;
  update_id: number | null;
  chat: number;
  user_id: number;
  message_id: number | null;
  prompt: string;
  status: string;
  attempts: number;
  available_at: number;
  created_at: number;
  claimed_at: number | null;
  updated_at: number;
  error: string | null;
}
