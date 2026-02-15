#!/usr/bin/env bun
/**
 * council.ts - Multi-model design review orchestrator (INDEPENDENT MODE)
 *
 * This is the one-shot parallel review mode. For dialogue mode, use chat.ts
 * with conversation loops managed by Claude Code subagents.
 *
 * Usage: bun council.ts [options] <context>
 *
 * Options:
 *   --adversarial     Assign devil's advocate role to one reviewer
 *   --timeout <sec>   Per-model timeout (default: 45)
 *   --max-cost <$>    Abort if estimated cost exceeds (default: 4.00)
 *   --artifact <name> Name of artifact being reviewed
 */

import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
// Note: Anthropic SDK not needed - Opus participates via Claude Code directly

// Types
interface ReviewerResult {
  model: string;
  response: string;
  tokens: { input: number; output: number; thinking?: number };
  cost: number;
  error?: string;
  timedOut?: boolean;
}

interface CouncilResult {
  artifact: string;
  timestamp: string;
  reviewers: ReviewerResult[];
  totalCost: number;
  summary?: string;
}

type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

// Pricing (Jan 2026) - per 1M tokens
const PRICING = {
  "gpt-5.2": { input: 1.75, output: 14, thinking: 14 },
  "gemini-3-pro-preview": { input: 2.0, output: 12, thinking: 0 },
};
// Note: Opus participates directly in Claude Code (free on subscription), not via this script

// Prompts
const BASE_PROMPT = `You are a senior engineer reviewing a design proposal.

Your job is NOT to approve or reject. Your job is to:
1. Identify assumptions that may be wrong
2. Surface alternative approaches not considered
3. Point out blind spots or unstated dependencies
4. Answer the structured questions below

Be genuinely helpful like a peer in design review. Do not rubber-stamp.
Do not be contrarian for its own sake.

## Structured Questions

1. List 3 assumptions this design makes that could be wrong
2. What's the worst-case failure mode?
3. What would a simpler alternative look like?
4. What context would change your assessment?

## Design to Review

`;

const ADVERSARIAL_ADDENDUM = `

IMPORTANT: You are the critical reviewer (devil's advocate). Your job is to find reasons
this will fail, identify overengineering, and propose simpler alternatives. Be constructively
critical. The other reviewers are looking for problems too, but you should be especially thorough.`;

// Diversity addendum not needed - Opus participates via Claude Code with full context

// Token estimation (rough: 1 token ≈ 4 chars)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function estimateCost(
  inputTokens: number,
  model: keyof typeof PRICING
): number {
  const pricing = PRICING[model];
  // Assume 15k thinking tokens, 1.5k output for estimation
  const thinkingTokens = 15000;
  const outputTokens = 1500;

  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const thinkingCost = pricing.thinking
    ? (thinkingTokens / 1_000_000) * pricing.thinking
    : 0;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;

  return inputCost + thinkingCost + outputCost;
}

// API Clients
function getOpenAIClient(): Result<OpenAI, string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "OPENAI_API_KEY not set" };
  return { ok: true, value: new OpenAI({ apiKey }) };
}

function getGeminiClient(): Result<GoogleGenerativeAI, string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, error: "GEMINI_API_KEY not set" };
  return { ok: true, value: new GoogleGenerativeAI(apiKey) };
}

// Anthropic client not needed - Opus participates via Claude Code directly

// Review functions
async function reviewWithGPT(
  context: string,
  adversarial: boolean,
  timeout: number
): Promise<ReviewerResult> {
  const clientResult = getOpenAIClient();
  if (!clientResult.ok) {
    return {
      model: "GPT-5.2",
      response: "",
      tokens: { input: 0, output: 0 },
      cost: 0,
      error: clientResult.error,
    };
  }

  const client = clientResult.value;
  const prompt = BASE_PROMPT + context + (adversarial ? ADVERSARIAL_ADDENDUM : "");

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout * 1000);

    const response = await client.chat.completions.create(
      {
        model: "gpt-5.2",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 4096,
      },
      { signal: controller.signal }
    );

    clearTimeout(timeoutId);

    const usage = response.usage ?? { prompt_tokens: 0, completion_tokens: 0 };
    const thinkingTokens = (usage as any).reasoning_tokens ?? 0;

    const cost =
      (usage.prompt_tokens / 1_000_000) * PRICING["gpt-5.2"].input +
      (thinkingTokens / 1_000_000) * PRICING["gpt-5.2"].thinking +
      (usage.completion_tokens / 1_000_000) * PRICING["gpt-5.2"].output;

    return {
      model: "GPT-5.2",
      response: response.choices[0]?.message?.content ?? "",
      tokens: {
        input: usage.prompt_tokens,
        output: usage.completion_tokens,
        thinking: thinkingTokens,
      },
      cost,
    };
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    return {
      model: "GPT-5.2",
      response: "",
      tokens: { input: 0, output: 0 },
      cost: 0,
      error: isTimeout ? undefined : String(err),
      timedOut: isTimeout,
    };
  }
}

async function reviewWithGemini(
  context: string,
  adversarial: boolean,
  timeout: number
): Promise<ReviewerResult> {
  const clientResult = getGeminiClient();
  if (!clientResult.ok) {
    return {
      model: "Gemini 3 Pro",
      response: "",
      tokens: { input: 0, output: 0 },
      cost: 0,
      error: clientResult.error,
    };
  }

  const client = clientResult.value;
  const model = client.getGenerativeModel({
    model: "gemini-3-pro-preview",
  });

  const prompt = BASE_PROMPT + context + (adversarial ? ADVERSARIAL_ADDENDUM : "");

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout * 1000);

    const result = await model.generateContent(prompt, {
      signal: controller.signal,
    } as any);

    clearTimeout(timeoutId);

    const response = result.response;
    const usage = response.usageMetadata ?? {
      promptTokenCount: 0,
      candidatesTokenCount: 0,
      thoughtsTokenCount: 0,
    };

    const cost =
      ((usage.promptTokenCount ?? 0) / 1_000_000) * PRICING["gemini-3-pro-preview"].input +
      ((usage.thoughtsTokenCount ?? 0) / 1_000_000) * PRICING["gemini-3-pro-preview"].thinking +
      ((usage.candidatesTokenCount ?? 0) / 1_000_000) * PRICING["gemini-3-pro-preview"].output;

    return {
      model: "Gemini 3 Pro",
      response: response.text(),
      tokens: {
        input: usage.promptTokenCount ?? 0,
        output: usage.candidatesTokenCount ?? 0,
        thinking: usage.thoughtsTokenCount ?? 0,
      },
      cost,
    };
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    return {
      model: "Gemini 3 Pro",
      response: "",
      tokens: { input: 0, output: 0 },
      cost: 0,
      error: isTimeout ? undefined : String(err),
      timedOut: isTimeout,
    };
  }
}

// Haiku function removed - Opus participates via Claude Code directly

// Progress indicator
function showProgress(models: string[]): NodeJS.Timeout {
  const states = models.map(() => "thinking");

  const render = () => {
    const lines = models.map((m, i) => `  ${m}: ${states[i]}...`);
    process.stderr.write(`\r${lines.join("  ")}`);
  };

  render();
  return setInterval(render, 500);
}

// Result formatting
function formatResults(result: CouncilResult): string {
  const { artifact, timestamp, reviewers, totalCost } = result;

  const successful = reviewers.filter(r => r.response && !r.error && !r.timedOut);
  const failed = reviewers.filter(r => r.error || r.timedOut);

  let md = `# Council Review: ${artifact}\n\n`;
  md += `**Date**: ${timestamp}\n`;
  md += `**Reviewers**: ${successful.map(r => r.model).join(", ")}`;
  if (failed.length > 0) {
    md += ` (failed: ${failed.map(r => r.model).join(", ")})`;
  }
  md += `\n**Cost**: $${totalCost.toFixed(2)}\n\n`;

  // Summary section (placeholder - would need synthesis)
  md += `## Summary\n\n`;
  md += `Review completed with ${successful.length}/${reviewers.length} reviewers.\n\n`;

  // Individual responses
  md += `---\n\n`;

  for (const reviewer of successful) {
    md += `## ${reviewer.model}\n\n`;
    md += `*Tokens: ${reviewer.tokens.input} in, ${reviewer.tokens.output} out`;
    if (reviewer.tokens.thinking) {
      md += `, ${reviewer.tokens.thinking} thinking`;
    }
    md += ` | Cost: $${reviewer.cost.toFixed(3)}*\n\n`;
    md += reviewer.response + "\n\n";
  }

  for (const reviewer of failed) {
    md += `## ${reviewer.model} (FAILED)\n\n`;
    if (reviewer.timedOut) {
      md += `*Timed out*\n\n`;
    } else {
      md += `*Error: ${reviewer.error}*\n\n`;
    }
  }

  return md;
}

// Main
async function main() {
  const args = process.argv.slice(2);

  // Parse flags
  let adversarial = false;
  let timeout = 45;
  let maxCost = 4.0;
  let artifact = "design";
  let contextArg = "";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--adversarial") {
      adversarial = true;
    } else if (arg === "--timeout" && args[i + 1]) {
      timeout = parseInt(args[++i], 10);
    } else if (arg === "--max-cost" && args[i + 1]) {
      maxCost = parseFloat(args[++i]);
    } else if (arg === "--artifact" && args[i + 1]) {
      artifact = args[++i];
    } else if (!arg.startsWith("--")) {
      contextArg = arg;
    }
  }

  // Read context from stdin if not provided as arg
  let context = contextArg;
  if (!context) {
    const chunks: Buffer[] = [];
    for await (const chunk of Bun.stdin.stream()) {
      chunks.push(chunk);
    }
    context = Buffer.concat(chunks).toString("utf-8");
  }

  if (!context.trim()) {
    console.error("Error: No context provided. Pipe context via stdin or provide as argument.");
    process.exit(1);
  }

  // Estimate cost (GPT-5.2 + Gemini only; Opus participates free via Claude Code)
  const inputTokens = estimateTokens(BASE_PROMPT + context);
  const estimatedCost =
    estimateCost(inputTokens, "gpt-5.2") +
    estimateCost(inputTokens, "gemini-3-pro-preview");

  console.error(`Context: ${inputTokens} tokens (estimated)`);
  console.error(`Estimated cost: $${estimatedCost.toFixed(2)}`);

  if (estimatedCost > maxCost) {
    console.error(`Error: Estimated cost $${estimatedCost.toFixed(2)} exceeds --max-cost $${maxCost.toFixed(2)}`);
    process.exit(1);
  }

  // Check API keys (Opus participates via Claude Code, not here)
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasGemini = !!process.env.GEMINI_API_KEY;

  if (!hasOpenAI && !hasGemini) {
    console.error("Error: No external API keys configured. Set OPENAI_API_KEY and/or GEMINI_API_KEY.");
    console.error("Note: Opus participates directly in Claude Code (free on subscription).");
    process.exit(1);
  }

  const available: string[] = [];
  if (hasOpenAI) available.push("GPT-5.2");
  if (hasGemini) available.push("Gemini 3 Pro");

  console.error(`\nReviewers: ${available.join(", ")}`);
  console.error(`Timeout: ${timeout}s per model`);
  if (adversarial) console.error("Mode: adversarial (one devil's advocate reviewer)");
  console.error("");

  // Pick adversarial reviewer randomly (between external models only)
  const adversarialIndex = adversarial ? Math.floor(Math.random() * available.length) : -1;

  // Start reviews in parallel
  const progressInterval = showProgress(available);

  const reviewPromises: Promise<ReviewerResult>[] = [];

  if (hasOpenAI) {
    reviewPromises.push(reviewWithGPT(context, adversarialIndex === 0, timeout));
  }
  if (hasGemini) {
    reviewPromises.push(reviewWithGemini(context, adversarialIndex === 1, timeout));
  }
  // Note: Opus review happens in Claude Code directly, not via this script

  const results = await Promise.all(reviewPromises);

  clearInterval(progressInterval);
  console.error("\n");

  // Calculate total cost
  const totalCost = results.reduce((sum, r) => sum + r.cost, 0);

  // Format result
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const councilResult: CouncilResult = {
    artifact,
    timestamp,
    reviewers: results,
    totalCost,
  };

  const markdown = formatResults(councilResult);

  // Write to file
  const resultsDir = `${process.env.HOME}/.claude/skills/council/results`;
  const outputPath = `${resultsDir}/${timestamp}.md`;
  await Bun.write(outputPath, markdown);

  console.error(`Results written to: ${outputPath}`);
  console.error(`Total cost: $${totalCost.toFixed(2)}`);
  console.error("");

  // Print summary to stdout for Claude to read
  console.log(markdown);
}

main().catch((err) => {
  console.error("Council failed:", err);
  process.exit(1);
});
