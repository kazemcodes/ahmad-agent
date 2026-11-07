// Ordered use-case chain. The order mirrors the historical handle() —
// overlapping triggers make order load-bearing. Each use case returns true
// when it handled the message; the first true wins.
import type { ChatContext, Deps, UseCase } from './context.js';
import { startHelp } from './useCases/start.js';
import { replyCheckIn } from './useCases/replyCheckIn.js';
import { classInstructionsCmd } from './useCases/classInstructionsCmd.js';
import { staffCommands } from './useCases/staffCommands.js';
import { correctRequest } from './useCases/correctRequest.js';
import { nameCheckIn } from './useCases/nameCheckIn.js';
import { searchCmd } from './useCases/search.js';
import { webSearchCmd } from './useCases/webSearchCmd.js';
import { voiceCmd } from './useCases/voice.js';
import { documentSticker } from './useCases/documentSticker.js';
import { visionCmd } from './useCases/vision.js';
import { imageRequest } from './useCases/imageRequest.js';
import { chatCmd } from './useCases/chat.js';

export const CHAIN: UseCase[] = [
  startHelp,
  replyCheckIn,
  classInstructionsCmd,
  staffCommands,
  correctRequest,
  nameCheckIn,
  searchCmd,
  webSearchCmd,
  voiceCmd,
  documentSticker,
  visionCmd,
  imageRequest,
  chatCmd,
];

export async function dispatch(ctx: ChatContext, deps: Deps): Promise<boolean> {
  for (const useCase of CHAIN) {
    if (await useCase(ctx, deps)) return true;
  }
  return false;
}
