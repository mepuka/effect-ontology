/**
 * N3 Browser Bundle Wrapper
 *
 * The N3 browser bundle (n3.min.js) is a UMD module that exports to window.N3.
 * This wrapper provides ES module named exports for use in the UI.
 */

// @ts-ignore - browser bundle doesn't have types
import N3Lib from "/Users/pooks/Dev/effect-ontology/node_modules/n3/browser/n3.min.js?url"

// The browser bundle exports everything under N3
export const { DataFactory, Parser, Store, StreamParser, StreamWriter, Util, Writer } = N3Lib
export default N3Lib
