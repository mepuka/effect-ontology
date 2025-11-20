/// <reference types="vite/client" />

/**
 * TypeScript definitions for Vite environment variables
 *
 * These variables are loaded from .env files and injected by Vite
 * at build/dev time. Only VITE_* prefixed variables are exposed.
 */
interface ImportMetaEnv {
  // LLM Provider Selection
  readonly VITE_LLM_PROVIDER?: string

  // Anthropic Configuration
  readonly VITE_LLM_ANTHROPIC_API_KEY?: string
  readonly VITE_LLM_ANTHROPIC_MODEL?: string
  readonly VITE_LLM_ANTHROPIC_MAX_TOKENS?: string
  readonly VITE_LLM_ANTHROPIC_TEMPERATURE?: string

  // OpenAI Configuration
  readonly VITE_LLM_OPENAI_API_KEY?: string
  readonly VITE_LLM_OPENAI_MODEL?: string
  readonly VITE_LLM_OPENAI_MAX_TOKENS?: string
  readonly VITE_LLM_OPENAI_TEMPERATURE?: string

  // Gemini Configuration
  readonly VITE_LLM_GEMINI_API_KEY?: string
  readonly VITE_LLM_GEMINI_MODEL?: string
  readonly VITE_LLM_GEMINI_MAX_TOKENS?: string
  readonly VITE_LLM_GEMINI_TEMPERATURE?: string

  // OpenRouter Configuration
  readonly VITE_LLM_OPENROUTER_API_KEY?: string
  readonly VITE_LLM_OPENROUTER_MODEL?: string
  readonly VITE_LLM_OPENROUTER_MAX_TOKENS?: string
  readonly VITE_LLM_OPENROUTER_TEMPERATURE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
