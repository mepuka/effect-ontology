import { Context, Effect, Layer } from "effect";
declare const NomicNlpError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").Equals<A, {}> extends true ? void : { readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }) => import("effect/Cause").YieldableError & {
    readonly _tag: "NomicNlpError";
} & Readonly<A>;
/**
 * Nomic NLP Errors
 */
export declare class NomicNlpError extends NomicNlpError_base<{
    readonly message: string;
    readonly cause?: unknown;
}> {
}
/**
 * Task types for Nomic embeddings
 * - search_query: Use when embedding a query to find relevant documents
 * - search_document: Use when embedding documents to be searched
 * - clustering: Use for clustering tasks
 * - classification: Use for classification tasks
 */
export type NomicTaskType = "search_query" | "search_document" | "clustering" | "classification";
/**
 * Nomic NLP Service Interface
 */
export interface NomicNlpService {
    /**
     * Generate embedding for text
     *
     * @param text Input text
     * @param taskType Task type (defaults to "search_document")
     * @param dimensionality Optional dimension to truncate to (64-768)
     */
    readonly embed: (text: string, taskType?: NomicTaskType, dimensionality?: number) => Effect.Effect<ReadonlyArray<number>, NomicNlpError>;
    /**
     * Compute cosine similarity between two vectors
     */
    readonly cosineSimilarity: (a: ReadonlyArray<number>, b: ReadonlyArray<number>) => number;
}
/**
 * Service Tag
 */
export declare const NomicNlpService: Context.Tag<NomicNlpService, NomicNlpService>;
/**
 * Live Implementation
 */
export interface NomicNlpConfig {
    readonly modelId: string;
    readonly quantized: boolean;
}
export declare const NomicNlpConfig: Context.Tag<NomicNlpConfig, NomicNlpConfig>;
export declare const NomicNlpServiceLive: Layer.Layer<NomicNlpService, never, never>;
/**
 * Default NomicNlpService layer
 *
 * Uses NomicNlpServiceLive with default configuration.
 *
 * @since 2.0.0
 */
export declare const NomicNlpServiceDefault: Layer.Layer<NomicNlpService, never, never>;
export {};
//# sourceMappingURL=NomicNlp.d.ts.map