// Shared context + dependencies for use cases.
import type { Db } from './db.js';
import type { Config } from './config.js';
import { HttpClient } from './http.js';
import { BaleClient } from './bale.js';
import { RequestQueue } from './queues/requestQueue.js';
import { ImageQueue } from './queues/imageQueue.js';
import { Memory } from './memory.js';
import { ClassInstructions } from './classInstructions.js';
import type { BaleMessage, BaleUpdate } from './types.js';

export interface ChatContext {
  update: BaleUpdate;
  msg: BaleMessage & Record<string, any>;
  chat: number;
  user: number;
  mid: number | null;
  at: number;
  text: string;
  effectiveText: string;
  name: string;
  addressed: boolean;
  isBotReply: boolean;
  replyUsername: string;
  instructions: ClassInstructions;
}

export interface Deps {
  config: Config;
  db: Db;
  log: (event: string, ctx?: Record<string, unknown>) => void;
  send: (chat: number, text: string, reply?: number | null, replyMarkup?: unknown) => Promise<void>;
  typing: (chat: number, action?: string) => Promise<void>;
  staff: (user: number) => boolean;
  bale: BaleClient;
  http: HttpClient;
  memory: Memory;
  queue: RequestQueue;
  imageQueue: ImageQueue;
}

export type UseCase = (ctx: ChatContext, deps: Deps) => Promise<boolean>;
