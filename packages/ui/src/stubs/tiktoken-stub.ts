/**
 * Browser stub for tiktoken
 *
 * tiktoken uses WASM and Node.js dependencies that don't work in browsers.
 * Since the UI doesn't actually need tokenization (it just displays schemas),
 * we stub it out to prevent bundling issues.
 */

export function encoding_for_model() {
  console.warn("tiktoken is not available in browser mode")
  return {
    encode: () => [],
    decode: () => "",
    free: () => {}
  }
}

export function get_encoding() {
  return encoding_for_model()
}
