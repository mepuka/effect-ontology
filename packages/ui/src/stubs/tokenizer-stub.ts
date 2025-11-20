/**
 * Browser stub for @anthropic-ai/tokenizer
 *
 * The Anthropic tokenizer uses WASM and Node.js dependencies that don't work in browsers.
 * Since the UI doesn't actually need tokenization (it just displays schemas),
 * we stub it out to prevent bundling issues.
 */

export function getTokenizer() {
  console.warn("@anthropic-ai/tokenizer is not available in browser mode")
  return {
    encode: () => [],
    decode: () => "",
    countTokens: () => 0
  }
}

export function countTokens() {
  return 0
}
