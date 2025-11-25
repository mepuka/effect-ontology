/**
 * @effect-ontology/core-v2
 *
 * Effect-native knowledge extraction framework
 *
 * @since 2.0.0
 * @module index
 */

// Domain (pure types, no service dependencies)
export * as Domain from "./Domain/index.js"

// Services (Effect.Service classes with .Default layers)
export { ConfigService } from "./Service/Config.js"
export { EntityExtractor, RelationExtractor } from "./Service/Extraction.js"
export { NlpService } from "./Service/Nlp.js"
export { OntologyService } from "./Service/Ontology.js"
export { RdfBuilder } from "./Service/Rdf.js"

// Workflows (composable business logic)
export { streamingExtraction } from "./Workflow/StreamingExtraction.js"
export { extractToTurtle } from "./Workflow/TwoStageExtraction.js"

// Runtime (pre-composed layers)
