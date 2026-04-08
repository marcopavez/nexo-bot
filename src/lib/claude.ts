import Anthropic from '@anthropic-ai/sdk';
import type { ChatMessage } from './types';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function chat(systemPrompt: string, messages: ChatMessage[]): Promise<string> {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    system: systemPrompt,
    messages,
  });

  const block = response.content[0];
  return block.type === 'text' ? block.text : '';
}
