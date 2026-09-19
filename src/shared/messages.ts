// Typed message contracts between extension contexts. Every receiver validates
// with `parseMessage()` before acting, so a malformed or unexpected message is
// ignored rather than trusted.
import * as z from 'zod/mini';
import { SettingsSchema, type Settings } from './settings';

const LogValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const LogEventSchema = z.object({
  /** Epoch milliseconds. */
  t: z.number(),
  kind: z.string().check(z.maxLength(64)),
  data: z.optional(z.record(z.string(), LogValue)),
});
export type LogEvent = z.infer<typeof LogEventSchema>;

export const MessageSchema = z.discriminatedUnion('type', [
  /** background → content: settings changed. */
  z.object({ type: z.literal('SETTINGS_UPDATED'), settings: SettingsSchema }),
  /** popup → background: toggle Steady on a tab (the command shortcut does the same without a message). */
  z.object({ type: z.literal('PANIC_TOGGLE'), tabId: z.number() }),
  /** background → content, and background's reply to GET_TAB_STATE. */
  z.object({ type: z.literal('TAB_STATE'), panicked: z.boolean() }),
  /** content/popup → background: ask whether this tab is panicked. */
  z.object({ type: z.literal('GET_TAB_STATE'), tabId: z.optional(z.number()) }),
  /** content → background: study-log events (only sent when logging is on). */
  z.object({ type: z.literal('LOG_EVENT'), events: z.array(LogEventSchema).check(z.maxLength(500)) }),
  /** popup → background: fetch the buffered study log. */
  z.object({ type: z.literal('LOG_EXPORT') }),
  /** popup → background: clear the buffered study log. */
  z.object({ type: z.literal('LOG_CLEAR') }),
  /** popup → content: is Steady running in this tab? */
  z.object({ type: z.literal('PING') }),
]);

export type Message = z.infer<typeof MessageSchema>;
export type MessageOf<T extends Message['type']> = Extract<Message, { type: T }>;

export interface PingReply {
  running: boolean;
  suspendedBy: 'panic' | 'site' | 'global' | 'page' | 'error' | null;
  profileName: string;
}

export interface LogExportReply {
  participantId: string | null;
  events: LogEvent[];
}

export function parseMessage(raw: unknown): Message | null {
  const r = MessageSchema.safeParse(raw);
  return r.success ? r.data : null;
}

export function settingsUpdated(settings: Settings): MessageOf<'SETTINGS_UPDATED'> {
  return { type: 'SETTINGS_UPDATED', settings };
}

/** sendMessage that resolves to undefined instead of rejecting when no receiver exists. */
export async function sendToBackground<R = unknown>(msg: Message): Promise<R | undefined> {
  try {
    return (await chrome.runtime.sendMessage(msg)) as R;
  } catch {
    return undefined;
  }
}

export async function sendToTab<R = unknown>(tabId: number, msg: Message, frameId?: number): Promise<R | undefined> {
  try {
    return (await chrome.tabs.sendMessage(tabId, msg, frameId === undefined ? {} : { frameId })) as R;
  } catch {
    return undefined;
  }
}
