/**
 * N3 Browser Bundle Wrapper
 *
 * The N3 browser bundle (n3.min.js) is a UMD module that exports to window.N3.
 * This wrapper provides ES module named exports for use in the UI.
 *
 * Note: N3 is loaded via Vite's node polyfills, not directly from browser bundle.
 */

// Import N3 normally - Vite handles the polyfills
import * as N3Lib from "n3"

// Re-export N3 components
export const { DataFactory, Parser, Store, StreamParser, StreamWriter, Util, Writer } = N3Lib
export default N3Lib
