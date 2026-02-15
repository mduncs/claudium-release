#!/usr/bin/env bun
/**
 * chat.ts - Single message to external model, returns response
 * Used by dialogue mode - Claude Code orchestrates the conversation loop
 *
 * Usage:
 *   echo "message" | bun chat.ts --model gpt-5.2 [--conversation-id <id>]
 *   echo "message" | bun chat.ts --model gemini-3
 *
 * Returns JSON:
 *   { "response": "...", "tokens": {...}, "cost": 0.xx, "conversation_id": "..." }
 */

import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ConversationState {
  model: string;
  messages: Message[];
  totalCost: number;
}

const CONVO_DIR = `${process.env.HOME}/.claude/skills/council/conversations`;

// Ensure conversation directory exists
if (!existsSync(CONVO_DIR)) {
  mkdirSync(CONVO_DIR, { recursive: true });
}

function loadConversation(id: string): ConversationState | null {
  const path = `${CONVO_DIR}/${id}.json`;
  if (existsSync(path)) {
    return JSON.parse(readFileSync(path, "utf-8"));
  }
  return null;
}

function saveConversation(id: string, state: ConversationState): void {
  const path = `${CONVO_DIR}/${id}.json`;
  writeFileSync(path, JSON.stringify(state, null, 2));
}

function generateId(): string {
  return `convo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Pricing
const PRICING = {
  "gpt-5.2": { input: 2.5, output: 10, thinking: 10 },
  "gemini-3": { input: 1.25, output: 5, thinking: 5 },
};

async function chatGPT(messages: Message[]): Promise<{
  response: string;
  tokens: { input: number; output: number; thinking: number };
  cost: number;
}> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const client = new OpenAI({ apiKey });

  const result = await client.chat.completions.create({
    model: "gpt-5.2",
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    reasoning: { effort: "medium" }, // medium for dialogue, save tokens
  });

  const usage = result.usage ?? { prompt_tokens: 0, completion_tokens: 0 };
  const thinkingTokens = (usage as any).reasoning_tokens ?? 0;

  const cost =
    (usage.prompt_tokens / 1_000_000) * PRICING["gpt-5.2"].input +
    (thinkingTokens / 1_000_000) * PRICING["gpt-5.2"].thinking +
    (usage.completion_tokens / 1_000_000) * PRICING["gpt-5.2"].output;

  return {
    response: result.choices[0]?.message?.content ?? "",
    tokens: {
      input: usage.prompt_tokens,
      output: usage.completion_tokens,
      thinking: thinkingTokens,
    },
    cost,
  };
}

async function chatGemini(messages: Message[]): Promise<{
  response: string;
  tokens: { input: number; output: number; thinking: number };
  cost: number;
}> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({
    model: "gemini-2.5-pro",
  });

  // Convert to Gemini format
  const chat = model.startChat({
    history: messages.slice(0, -1).map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    })),
  });

  const lastMessage = messages[messages.length - 1];
  const result = await chat.sendMessage(lastMessage.content);

  const usage = result.response.usageMetadata ?? {
    promptTokenCount: 0,
    candidatesTokenCount: 0,
    thoughtsTokenCount: 0,
  };

  const cost =
    ((usage.promptTokenCount ?? 0) / 1_000_000) * PRICING["gemini-3"].input +
    ((usage.thoughtsTokenCount ?? 0) / 1_000_000) * PRICING["gemini-3"].thinking +
    ((usage.candidatesTokenCount ?? 0) / 1_000_000) * PRICING["gemini-3"].output;

  return {
    response: result.response.text(),
    tokens: {
      input: usage.promptTokenCount ?? 0,
      output: usage.candidatesTokenCount ?? 0,
      thinking: usage.thoughtsTokenCount ?? 0,
    },
    cost,
  };
}

async function main() {
  const args = process.argv.slice(2);

  let model = "";
  let conversationId = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--model" && args[i + 1]) {
      model = args[++i];
    } else if (args[i] === "--conversation-id" && args[i + 1]) {
      conversationId = args[++i];
    }
  }

  if (!model || !["gpt-5.2", "gemini-3"].includes(model)) {
    console.error("Usage: bun chat.ts --model <gpt-5.2|gemini-3> [--conversation-id <id>]");
    process.exit(1);
  }

  // Read message from stdin
  const chunks: Buffer[] = [];
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(chunk);
  }
  const userMessage = Buffer.concat(chunks).toString("utf-8").trim();

  if (!userMessage) {
    console.error("Error: No message provided via stdin");
    process.exit(1);
  }

  // Load or create conversation
  let state: ConversationState;
  let isNew = false;

  if (conversationId) {
    const loaded = loadConversation(conversationId);
    if (loaded) {
      state = loaded;
    } else {
      console.error(`Error: Conversation ${conversationId} not found`);
      process.exit(1);
    }
  } else {
    conversationId = generateId();
    state = { model, messages: [], totalCost: 0 };
    isNew = true;
  }

  // Add user message
  state.messages.push({ role: "user", content: userMessage });

  // Call appropriate model
  try {
    const result = model === "gpt-5.2"
      ? await chatGPT(state.messages)
      : await chatGemini(state.messages);

    // Add assistant response
    state.messages.push({ role: "assistant", content: result.response });
    state.totalCost += result.cost;

    // Save conversation
    saveConversation(conversationId, state);

    // Output result
    console.log(JSON.stringify({
      response: result.response,
      tokens: result.tokens,
      cost: result.cost,
      total_cost: state.totalCost,
      conversation_id: conversationId,
      message_count: state.messages.length,
      is_new: isNew,
    }, null, 2));

  } catch (err) {
    console.error(JSON.stringify({
      error: String(err),
      conversation_id: conversationId,
    }));
    process.exit(1);
  }
}

main();
