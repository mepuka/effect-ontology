# Effect Ontology Configuration Guide

Complete guide to configuring Effect Ontology for multi-provider LLM support, RDF services, and SHACL validation.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Configuration Architecture](#configuration-architecture)
- [LLM Provider Configuration](#llm-provider-configuration)
  - [Anthropic (Claude)](#anthropic-claude)
  - [Google Gemini](#google-gemini)
  - [OpenRouter](#openrouter)
- [RDF Configuration](#rdf-configuration)
- [SHACL Configuration](#shacl-configuration)
- [Testing with Configuration](#testing-with-configuration)
- [Advanced Usage](#advanced-usage)

## Overview

Effect Ontology uses **Effect.Config** for type-safe, declarative configuration management. Configuration is:

- **Type-safe**: Compile-time guarantees for all config values
- **Declarative**: Define schemas once, use everywhere
- **Testable**: Easy to provide mock configs in tests
- **Multi-provider**: Support for Anthropic, Gemini, and OpenRouter
- **Environment-based**: Load from `.env` files or environment variables

## Quick Start

### 1. Create `.env` file

```bash
cp .env.example .env
```

### 2. Configure your LLM provider

For Anthropic (Claude):

```env
LLM__PROVIDER=anthropic
LLM__ANTHROPIC_API_KEY=sk-ant-your-api-key-here
```

For Google Gemini:

```env
LLM__PROVIDER=gemini
LLM__GEMINI_API_KEY=your-gemini-api-key-here
```

For OpenRouter:

```env
LLM__PROVIDER=openrouter
LLM__OPENROUTER_API_KEY=your-openrouter-api-key-here
```

### 3. Use configuration in your code

```typescript
import { Effect } from "effect"
import { LlmConfigService } from "@effect-ontology/core/Config"

const program = Effect.gen(function* () {
  const config = yield* LlmConfigService

  console.log(`Using ${config.provider} provider`)

  // Access provider-specific config
  if (config.provider === "anthropic" && config.anthropic?._tag === "Some") {
    console.log(`Model: ${config.anthropic.value.model}`)
  }
})

// Run with default layer (loads from environment)
Effect.runPromise(Effect.provide(program, LlmConfigService.Default))
```

## Configuration Architecture

### Schema Layer

Configuration schemas define the structure and validation rules:

```typescript
// packages/core/src/Config/Schema.ts
export const LlmProviderConfig = Config.nested("LLM")(
  Config.all({
    provider: Config.string("PROVIDER").pipe(
      Config.validate({
        message: "Invalid provider",
        validation: (value): value is LlmProvider =>
          value === "anthropic" || value === "gemini" || value === "openrouter"
      })
    ),
    anthropic: Config.option(AnthropicConfigSchema),
    gemini: Config.option(GeminiConfigSchema),
    openrouter: Config.option(OpenRouterConfigSchema)
  })
)
```

### Service Layer

Services wrap configs as injectable Effect services:

```typescript
// packages/core/src/Config/Services.ts
export class LlmConfigService extends Effect.Service<LlmConfigService>()(
  "LlmConfigService",
  {
    effect: LlmProviderConfig,
    dependencies: []
  }
) {}
```

### Layer Pattern

Layers provide configuration to your application:

```typescript
// Production: Load from environment
Effect.provide(program, LlmConfigService.Default)

// Testing: Provide mock config
const testLayer = makeLlmTestConfig({
  provider: "anthropic",
  anthropic: {
    apiKey: "test-key",
    model: "claude-3-5-sonnet-20241022",
    maxTokens: 4096,
    temperature: 0.0
  }
})

Effect.provide(program, testLayer)
```

## LLM Provider Configuration

### Anthropic (Claude)

**Environment Variables:**

```env
LLM__PROVIDER=anthropic
LLM__ANTHROPIC_API_KEY=sk-ant-your-key-here
LLM__ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
LLM__ANTHROPIC_MAX_TOKENS=4096
LLM__ANTHROPIC_TEMPERATURE=0.0
```

**Available Models:**
- `claude-3-5-sonnet-20241022` (recommended for production)
- `claude-3-5-haiku-20241022` (faster, cheaper)
- `claude-3-opus-20240229` (most capable, slower)

**Usage:**

```typescript
import { Effect } from "effect"
import { LlmConfigService } from "@effect-ontology/core/Config"

const program = Effect.gen(function* () {
  const config = yield* LlmConfigService

  if (config.provider === "anthropic" && config.anthropic?._tag === "Some") {
    const { apiKey, model, maxTokens, temperature } = config.anthropic.value
    console.log(`Using Claude ${model} with ${maxTokens} max tokens`)
  }
})
```

### Google Gemini

**Environment Variables:**

```env
LLM__PROVIDER=gemini
LLM__GEMINI_API_KEY=your-gemini-key-here
LLM__GEMINI_MODEL=gemini-2.0-flash-exp
LLM__GEMINI_MAX_TOKENS=4096
LLM__GEMINI_TEMPERATURE=0.0
```

**Available Models:**
- `gemini-2.0-flash-exp` (recommended for fast responses)
- `gemini-1.5-pro` (most capable)
- `gemini-1.5-flash` (balanced)

### OpenRouter

**Environment Variables:**

```env
LLM__PROVIDER=openrouter
LLM__OPENROUTER_API_KEY=your-or-key-here
LLM__OPENROUTER_MODEL=anthropic/claude-3.5-sonnet
LLM__OPENROUTER_MAX_TOKENS=4096
LLM__OPENROUTER_TEMPERATURE=0.0
LLM__OPENROUTER_SITE_URL=https://your-app.com
LLM__OPENROUTER_SITE_NAME=YourAppName
```

**Model Examples:**
- `anthropic/claude-3.5-sonnet`
- `google/gemini-2.0-flash-exp`
- `openai/gpt-4-turbo`
- See [OpenRouter Models](https://openrouter.ai/models) for full list

## RDF Configuration

Configure N3-based RDF operations:

**Environment Variables:**

```env
RDF__FORMAT=Turtle
RDF__BASE_IRI=http://example.org/
```

**Available Formats:**
- `Turtle` (default, recommended)
- `N-Triples`
- `N-Quads`
- `TriG`

**Default Prefixes:**

The following prefixes are automatically configured:

```typescript
{
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  xsd: "http://www.w3.org/2001/XMLSchema#",
  foaf: "http://xmlns.com/foaf/0.1/",
  dcterms: "http://purl.org/dc/terms/"
}
```

**Usage:**

```typescript
import { Effect } from "effect"
import { RdfConfigService } from "@effect-ontology/core/Config"

const program = Effect.gen(function* () {
  const config = yield* RdfConfigService

  console.log(`RDF Format: ${config.format}`)
  console.log(`Prefixes:`, config.prefixes)
})
```

## SHACL Configuration

Configure SHACL validation (future feature):

**Environment Variables:**

```env
SHACL__ENABLED=false
SHACL__SHAPES_PATH=./shapes/ontology.ttl
SHACL__STRICT_MODE=true
```

**Options:**
- `ENABLED`: Enable/disable SHACL validation
- `SHAPES_PATH`: Path to SHACL shapes file
- `STRICT_MODE`: Fail on validation errors

## Testing with Configuration

### Test Helpers

Use test configuration helpers for unit tests:

```typescript
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import {
  LlmConfigService,
  makeLlmTestConfig
} from "@effect-ontology/core/Config"

describe("MyService", () => {
  it.effect("should use LLM config", () => {
    const testLayer = makeLlmTestConfig({
      provider: "anthropic",
      anthropic: {
        apiKey: "test-key",
        model: "claude-3-5-sonnet-20241022",
        maxTokens: 4096,
        temperature: 0.0
      }
    })

    return Effect.gen(function* () {
      const config = yield* LlmConfigService

      expect(config.provider).toBe("anthropic")
      if (config.anthropic?._tag === "Some") {
        expect(config.anthropic.value.apiKey).toBe("test-key")
      }
    }).pipe(Effect.provide(testLayer))
  })
})
```

### Default Test Config

Use the pre-configured default test layer:

```typescript
import { DefaultTestConfig } from "@effect-ontology/core/Config"

const program = Effect.gen(function* () {
  const config = yield* LlmConfigService
  // Uses Anthropic with test API key
})

Effect.provide(program, DefaultTestConfig)
```

### Layer Composition

Combine multiple config layers for testing:

```typescript
import { Layer } from "effect"
import {
  makeLlmTestConfig,
  makeRdfTestConfig
} from "@effect-ontology/core/Config"

const testLayer = Layer.merge(
  makeLlmTestConfig({
    provider: "anthropic",
    anthropic: {
      apiKey: "test-key",
      model: "claude-3-5-sonnet-20241022",
      maxTokens: 4096,
      temperature: 0.0
    }
  }),
  makeRdfTestConfig({
    format: "Turtle",
    prefixes: {
      ex: "http://example.org/"
    }
  })
)

Effect.provide(program, testLayer)
```

## Advanced Usage

### Programmatic Configuration

Create config providers programmatically:

```typescript
import { ConfigProvider, Effect, Layer } from "effect"

const testConfig = ConfigProvider.fromMap(
  new Map([
    ["LLM.PROVIDER", "anthropic"],
    ["LLM.ANTHROPIC_API_KEY", "test-key"],
    ["LLM.ANTHROPIC_MODEL", "claude-3-5-sonnet-20241022"]
  ])
)

const program = Effect.gen(function* () {
  const config = yield* LlmProviderConfig
  console.log(config.provider) // "anthropic"
}).pipe(
  Effect.provide(Layer.setConfigProvider(testConfig))
)
```

### Accessing Raw Config Schemas

Use raw config schemas without services:

```typescript
import { Effect } from "effect"
import { LlmProviderConfig } from "@effect-ontology/core/Config"

const program = Effect.gen(function* () {
  const config = yield* LlmProviderConfig
  // Returns raw LlmConfig object
})
```

### Environment Variable Naming

Effect.Config uses double underscores (`__`) for nested configs:

```env
LLM__PROVIDER=anthropic          # Config.nested("LLM")(Config.string("PROVIDER"))
LLM__ANTHROPIC_API_KEY=key       # Config.nested("LLM")(Config.string("ANTHROPIC_API_KEY"))
RDF__FORMAT=Turtle               # Config.nested("RDF")(Config.string("FORMAT"))
```

### Validation Errors

Config validation happens at runtime with clear error messages:

```typescript
// Invalid provider
LLM__PROVIDER=invalid-provider
// Error: Invalid provider. Must be one of: anthropic, gemini, openrouter

// Invalid RDF format
RDF__FORMAT=InvalidFormat
// Error: Invalid RDF format
```

### Default Values

Use `Config.withDefault` for optional values:

```typescript
Config.withDefault(Config.number("MAX_TOKENS"), 4096)
// If MAX_TOKENS not set, uses 4096
```

### Optional Values

Use `Config.option` for truly optional values:

```typescript
Config.option(Config.string("SITE_URL"))
// Returns Option<string> - None if not set, Some(value) if set
```

## Best Practices

1. **Never commit `.env` files** - Keep API keys secret
2. **Use environment-specific files** - `.env.production`, `.env.development`
3. **Provide test configs programmatically** - Don't rely on `.env` for tests
4. **Validate early** - Config loading fails fast on startup
5. **Use type-safe access** - Leverage TypeScript for config safety
6. **Document required vars** - Update `.env.example` when adding new config
7. **Rotate API keys regularly** - Security best practice
8. **Use strict provider validation** - Only valid providers are accepted

## Troubleshooting

### Missing Configuration

```
Error: (MissingData) Expected LLM.ANTHROPIC_API_KEY to exist in the process context
```

**Solution**: Add the missing environment variable to `.env`

### Invalid Provider

```
Error: Invalid provider. Must be one of: anthropic, gemini, openrouter
```

**Solution**: Check `LLM__PROVIDER` value in `.env`

### Type Errors with Option

```typescript
// ❌ Wrong - apiKey is Option<...>
config.anthropic?.apiKey

// ✅ Correct - check Option tag
if (config.anthropic?._tag === "Some") {
  config.anthropic.value.apiKey
}
```

## Examples

See complete examples in:
- `packages/core/test/Config/` - Test files with usage examples
- `.env.example` - All available configuration options
- `packages/core/src/Config/` - Implementation and docs

## API Reference

- **Types**: `LlmConfig`, `RdfConfig`, `ShaclConfig`, `AppConfig`
- **Schemas**: `LlmProviderConfig`, `RdfConfigSchema`, `ShaclConfigSchema`
- **Services**: `LlmConfigService`, `RdfConfigService`, `ShaclConfigService`
- **Helpers**: `makeLlmTestConfig`, `makeRdfTestConfig`, `makeShaclTestConfig`
- **Layers**: `DefaultTestConfig`

For detailed API documentation, see type definitions in `packages/core/src/Config/`.
