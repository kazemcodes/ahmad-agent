// Thin wrapper over HttpClient for tapi.bale.ai calls.
import type { HttpClient } from './http.js';

export class BaleClient {
  constructor(
    private http: HttpClient,
    private token: string,
  ) {}

  private api(method: string, data: Record<string, unknown>): Promise<any> {
    return this.http.http(`https://tapi.bale.ai/bot${this.token}/${method}`, data);
  }

  sendMessage(chat: number, text: string, replyTo?: number | null): Promise<any> {
    const d: Record<string, unknown> = { chat_id: chat, text };
    if (replyTo) d.reply_to_message_id = replyTo;
    return this.api('sendMessage', d);
  }

  sendChatAction(chat: number, action: string): Promise<any> {
    return this.api('sendChatAction', { chat_id: chat, action });
  }

  answerCallbackQuery(id: string, text: string): Promise<any> {
    return this.api('answerCallbackQuery', { callback_query_id: id, text });
  }

  getFile(fileId: string): Promise<any> {
    return this.api('getFile', { file_id: fileId });
  }

  getUpdates(offset: number, timeout: number): Promise<any> {
    return this.api('getUpdates', { offset, timeout });
  }

  deleteWebhook(): Promise<any> {
    return this.api('deleteWebhook', {});
  }
}
