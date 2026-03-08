/**
 * Shared LLM utilities with Anthropic prompt caching support.
 *
 * Model router: detects Claude models and calls Anthropic API directly
 * (with cache_control on system messages) instead of going through
 * the OpenAI-compatible gateway which doesn't support caching.
 *
 * For non-Claude models, falls through to OpenAI-compatible gateway as before.
 */

import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { config } from "../lib/config.js";

// ---------------------------------------------------------------------------
// Model detection
// ---------------------------------------------------------------------------

/** Check if a model name refers to an Anthropic Claude model (direct API). */
export function isAnthropicModel(model: string): boolean {
  return model.startsWith("claude-");
}

/** Check if a model name uses the ollama: prefix for local Ollama models. */
export function isOllamaModel(model: string): boolean {
  return model.startsWith("ollama:");
}

/** Strip the ollama: prefix to get the actual model name. */
export function getOllamaModelName(model: string): string {
  return model.replace(/^ollama:/, "");
}

// ---------------------------------------------------------------------------
// LLM construction
// ---------------------------------------------------------------------------

export interface LLMConfig {
  model: string;
  temperature: number;
}

/**
 * Create a LangChain chat model routed to the correct provider.
 * - Claude models -> ChatAnthropic (direct, supports prompt caching)
 * - Others -> ChatOpenAI (via OpenAI-compatible gateway)
 */
export function createLLM(cfg: LLMConfig): ChatOpenAI | ChatAnthropic {
  if (isAnthropicModel(cfg.model)) {
    const apiKey = config.anthropicApiKey;
    if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY for Claude model");
    return new ChatAnthropic({
      model: cfg.model,
      temperature: cfg.temperature,
      anthropicApiKey: apiKey,
    });
  }

  if (isOllamaModel(cfg.model)) {
    return new ChatOpenAI({
      model: getOllamaModelName(cfg.model),
      temperature: cfg.temperature,
      apiKey: "ollama",
      configuration: { baseURL: config.ollamaBaseUrl },
    });
  }

  const openaiApiKey = config.openaiApiKey;
  if (!openaiApiKey) throw new Error("Missing OPENAI_API_KEY");
  const baseUrl = config.openaiBaseUrl;
  return new ChatOpenAI({
    model: cfg.model,
    temperature: cfg.temperature,
    apiKey: openaiApiKey,
    configuration: { baseURL: baseUrl },
  });
}

// ---------------------------------------------------------------------------
// Cached system message
// ---------------------------------------------------------------------------

/**
 * Build a system message with Anthropic cache_control for Claude models.
 * For non-Claude models, returns a plain SystemMessage.
 */
export function buildCachedSystemMessage(model: string, content: string): SystemMessage {
  if (isAnthropicModel(model) && !isOllamaModel(model)) {
    return new SystemMessage({
      content: [
        {
          type: "text",
          text: content,
          // @ts-ignore -- cache_control is an Anthropic extension
          cache_control: { type: "ephemeral" },
        },
      ],
    });
  }
  return new SystemMessage(content);
}

// ---------------------------------------------------------------------------
// Structured output (planning, coverage, grading)
// ---------------------------------------------------------------------------

/**
 * Invoke LLM with structured output (Zod schema) and prompt caching.
 */
export async function invokeStructuredWithCaching<T>(
  cfg: LLMConfig,
  systemPrompt: string,
  task: string,
  schema: any,
  timeoutMs: number,
): Promise<T> {
  const llm = createLLM(cfg);
  const structured = llm.withStructuredOutput(schema);
  const messages = [
    buildCachedSystemMessage(cfg.model, systemPrompt),
    new HumanMessage(task),
  ];

  const result = await Promise.race([
    structured.invoke(messages),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
  return result as T;
}
