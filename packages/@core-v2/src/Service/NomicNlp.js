/**
 * Nomic NLP Service - Effect wrapper for Nomic Embeddings via Transformers.js
 *
 * Provides high-quality text embeddings using nomic-embed-text-v1.5.
 * Supports Matryoshka Representation Learning (MRL) and quantization.
 */
import { pipeline } from "@xenova/transformers";
import { Context, Data, Effect, Layer, Option } from "effect";
/**
 * Nomic NLP Errors
 */
export class NomicNlpError extends Data.TaggedError("NomicNlpError") {
}
/**
 * Service Tag
 */
export const NomicNlpService = Context.GenericTag("@effect-ontology/core/NomicNlpService");
export const NomicNlpConfig = Context.GenericTag("@effect-ontology/core/NomicNlpConfig");
export const NomicNlpServiceLive = Layer.effect(NomicNlpService, Effect.gen(function* () {
    // Get config or default to v1.5
    const config = yield* Effect.serviceOption(NomicNlpConfig).pipe(Effect.map(Option.getOrElse(() => ({
        modelId: "Xenova/nomic-embed-text-v1",
        quantized: true
    }))));
    // Lazy initialization of the pipeline
    // We use Effect.cached to ensure the pipeline is only created once
    // and shared across all calls.
    const getPipeline = yield* Effect.cached(Effect.tryPromise({
        try: () => pipeline("feature-extraction", config.modelId, {
            quantized: config.quantized
        }),
        catch: (cause) => new NomicNlpError({ message: `Failed to load Nomic model ${config.modelId}`, cause })
    }));
    const embed = (text, taskType = "search_document", dimensionality = 768) => Effect.gen(function* () {
        const pipe = yield* getPipeline;
        // Add task prefix as required by Nomic v1.5
        const prefix = `${taskType}: `;
        const input = prefix + text;
        return yield* Effect.tryPromise({
            try: async () => {
                const output = await pipe(input, {
                    pooling: "mean",
                    normalize: true
                });
                // Convert Float32Array to regular array
                let vector = Array.from(output.data);
                // Matryoshka Representation Learning (MRL) - Truncate if needed
                // Nomic v1.5 supports 64, 128, 256, 512, 768
                if (dimensionality < 768 && dimensionality > 0) {
                    vector = vector.slice(0, dimensionality);
                    // Re-normalize after truncation (important for MRL)
                    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
                    if (norm > 0) {
                        vector = vector.map((val) => val / norm);
                    }
                }
                return vector;
            },
            catch: (cause) => new NomicNlpError({ message: "Failed to generate embedding", cause })
        });
    });
    const cosineSimilarity = (a, b) => {
        if (a.length !== b.length) {
            throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
        }
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        if (normA === 0 || normB === 0)
            return 0;
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    };
    return {
        embed,
        cosineSimilarity
    };
}));
/**
 * Default NomicNlpService layer
 *
 * Uses NomicNlpServiceLive with default configuration.
 *
 * @since 2.0.0
 */
export const NomicNlpServiceDefault = NomicNlpServiceLive;
//# sourceMappingURL=NomicNlp.js.map