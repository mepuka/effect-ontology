/**
 * Schema: Knowledge Model
 *
 * Three-layer model for news domain where facts can conflict.
 * - Claim: Reported fact from document (may conflict with others)
 * - Assertion: Normalized RDF triple (curated/accepted)
 * - DerivedAssertion: Inferred by reasoning rule
 *
 * @since 2.0.0
 * @module Domain/Schema/KnowledgeModel
 */

import { Schema } from "effect"
import { GcsUri } from "../Identity.js"
import { IriSchema, Literal } from "../Rdf/Types.js"

// =============================================================================
// Identity Types
// =============================================================================

/**
 * ClaimId: claim-{12 hex chars}
 * Unique identifier for extracted claims
 *
 * @since 2.0.0
 * @category Identity
 */
export const ClaimId = Schema.String.pipe(
  Schema.pattern(/^claim-[a-f0-9]{12}$/),
  Schema.brand("ClaimId"),
  Schema.annotations({
    title: "Claim ID",
    description: "Unique identifier for an extracted claim"
  })
)
export type ClaimId = typeof ClaimId.Type

/**
 * AssertionId: assertion-{12 hex chars}
 * Unique identifier for curated assertions
 *
 * @since 2.0.0
 * @category Identity
 */
export const AssertionId = Schema.String.pipe(
  Schema.pattern(/^assertion-[a-f0-9]{12}$/),
  Schema.brand("AssertionId"),
  Schema.annotations({
    title: "Assertion ID",
    description: "Unique identifier for a curated assertion"
  })
)
export type AssertionId = typeof AssertionId.Type

/**
 * DerivedAssertionId: derived-{12 hex chars}
 * Unique identifier for inferred assertions
 *
 * @since 2.0.0
 * @category Identity
 */
export const DerivedAssertionId = Schema.String.pipe(
  Schema.pattern(/^derived-[a-f0-9]{12}$/),
  Schema.brand("DerivedAssertionId"),
  Schema.annotations({
    title: "Derived Assertion ID",
    description: "Unique identifier for an inferred assertion"
  })
)
export type DerivedAssertionId = typeof DerivedAssertionId.Type

/**
 * RuleId: rule-{identifier}
 * Unique identifier for reasoning rules
 *
 * @since 2.0.0
 * @category Identity
 */
export const RuleId = Schema.String.pipe(
  Schema.pattern(/^rule-[a-z0-9-]+$/),
  Schema.brand("RuleId"),
  Schema.annotations({
    title: "Rule ID",
    description: "Unique identifier for a reasoning rule"
  })
)
export type RuleId = typeof RuleId.Type

// =============================================================================
// Evidence
// =============================================================================

/**
 * Text span evidence from source document
 *
 * Captures the exact location of evidence in the source text.
 *
 * @since 2.0.0
 * @category Evidence
 */
export const TextSpan = Schema.Struct({
  /** Start character offset in source document */
  start: Schema.Number.pipe(
    Schema.int(),
    Schema.nonNegative(),
    Schema.annotations({
      title: "Start Offset",
      description: "Start character offset (0-indexed)"
    })
  ),
  /** End character offset in source document */
  end: Schema.Number.pipe(
    Schema.int(),
    Schema.nonNegative(),
    Schema.annotations({
      title: "End Offset",
      description: "End character offset (exclusive)"
    })
  ),
  /** Extracted text snippet */
  text: Schema.String.annotations({
    title: "Text",
    description: "Extracted text from the span"
  })
}).annotations({
  title: "Text Span",
  description: "Character span in source document"
})
export type TextSpan = typeof TextSpan.Type

/**
 * Evidence supporting a claim
 *
 * Contains source document reference and text spans that support the claim.
 *
 * @since 2.0.0
 * @category Evidence
 */
export const Evidence = Schema.Struct({
  /** Source document URI (GCS or HTTP) */
  documentUri: Schema.Union(GcsUri, Schema.String).annotations({
    title: "Document URI",
    description: "Source document URI (gs:// or http://)"
  }),
  /** Text spans supporting the claim */
  spans: Schema.Array(TextSpan).annotations({
    title: "Spans",
    description: "Text spans supporting this claim"
  }),
  /** Optional: Section/paragraph context */
  context: Schema.optional(Schema.String).annotations({
    title: "Context",
    description: "Section or paragraph context"
  })
}).annotations({
  title: "Evidence",
  description: "Evidence supporting a claim"
})
export type Evidence = typeof Evidence.Type

// =============================================================================
// RDF Object Value
// =============================================================================

/**
 * RDF object value (IRI or Literal)
 *
 * @since 2.0.0
 * @category RDF
 */
export const RdfObject = Schema.Union(
  IriSchema,
  Schema.instanceOf(Literal)
).annotations({
  title: "RDF Object",
  description: "RDF object value (IRI or Literal)"
})
export type RdfObject = typeof RdfObject.Type

// =============================================================================
// Claim
// =============================================================================

/**
 * Wikidata-style rank for claims
 *
 * - preferred: Current best value
 * - normal: Standard claim
 * - deprecated: Superseded or incorrect
 *
 * @since 2.0.0
 * @category Claim
 */
export const ClaimRank = Schema.Literal("preferred", "normal", "deprecated").annotations({
  title: "Claim Rank",
  description: "Wikidata-style rank (preferred > normal > deprecated)"
})
export type ClaimRank = typeof ClaimRank.Type

/**
 * Claim - Reported fact from document
 *
 * A claim represents a single fact extracted from a source document.
 * Claims may conflict with other claims and require curation.
 *
 * @example
 * ```typescript
 * const claim = {
 *   id: "claim-abc123def456" as ClaimId,
 *   subject: "http://example.org/entity/123" as IRI,
 *   predicate: "http://schema.org/name" as IRI,
 *   object: new Literal({ value: "John Doe" }),
 *   documentUri: "gs://bucket/docs/article.txt" as GcsUri,
 *   evidence: { documentUri: "gs://...", spans: [...] },
 *   extractedAt: new Date(),
 *   confidence: 0.95
 * }
 * ```
 *
 * @since 2.0.0
 * @category Claim
 */
export const Claim = Schema.Struct({
  /** Unique claim identifier */
  id: ClaimId,
  /** Subject IRI of the claim */
  subject: IriSchema.annotations({
    title: "Subject",
    description: "Subject entity IRI"
  }),
  /** Predicate IRI of the claim */
  predicate: IriSchema.annotations({
    title: "Predicate",
    description: "Predicate/property IRI"
  }),
  /** Object value (IRI or Literal) */
  object: RdfObject.annotations({
    title: "Object",
    description: "Object value (IRI or Literal)"
  }),
  /** Source document URI */
  documentUri: GcsUri.annotations({
    title: "Document URI",
    description: "Source document URI"
  }),
  /** Evidence supporting the claim */
  evidence: Evidence,
  /** When the claim was extracted */
  extractedAt: Schema.DateTimeUtc.annotations({
    title: "Extracted At",
    description: "Timestamp when claim was extracted"
  }),
  /** Confidence score (0-1) */
  confidence: Schema.Number.pipe(
    Schema.greaterThanOrEqualTo(0),
    Schema.lessThanOrEqualTo(1),
    Schema.annotations({
      title: "Confidence",
      description: "Extraction confidence score (0-1)"
    })
  ),
  /** Claim rank (Wikidata-style) */
  rank: Schema.optionalWith(ClaimRank, { default: () => "normal" as const }).annotations({
    title: "Rank",
    description: "Wikidata-style rank (default: normal)"
  }),
  /** Optional temporal validity start */
  validFrom: Schema.optional(Schema.DateTimeUtc).annotations({
    title: "Valid From",
    description: "Start of temporal validity period"
  }),
  /** Optional temporal validity end */
  validTo: Schema.optional(Schema.DateTimeUtc).annotations({
    title: "Valid To",
    description: "End of temporal validity period"
  })
}).annotations({
  title: "Claim",
  description: "Reported fact extracted from a source document"
})
export type Claim = typeof Claim.Type

// =============================================================================
// Assertion
// =============================================================================

/**
 * Assertion status
 *
 * @since 2.0.0
 * @category Assertion
 */
export const AssertionStatus = Schema.Literal("accepted", "rejected", "pending").annotations({
  title: "Assertion Status",
  description: "Curation status of the assertion"
})
export type AssertionStatus = typeof AssertionStatus.Type

/**
 * Assertion - Normalized, curated RDF triple
 *
 * An assertion is a curated fact derived from one or more claims.
 * After curation, assertions are accepted into the knowledge base.
 *
 * @example
 * ```typescript
 * const assertion = {
 *   id: "assertion-abc123def456" as AssertionId,
 *   subject: "http://example.org/entity/123" as IRI,
 *   predicate: "http://schema.org/name" as IRI,
 *   object: new Literal({ value: "John Doe" }),
 *   assertedAt: new Date(),
 *   derivedFrom: ["claim-abc123def456" as ClaimId],
 *   status: "accepted"
 * }
 * ```
 *
 * @since 2.0.0
 * @category Assertion
 */
export const Assertion = Schema.Struct({
  /** Unique assertion identifier */
  id: AssertionId,
  /** Subject IRI of the assertion */
  subject: IriSchema.annotations({
    title: "Subject",
    description: "Subject entity IRI"
  }),
  /** Predicate IRI of the assertion */
  predicate: IriSchema.annotations({
    title: "Predicate",
    description: "Predicate/property IRI"
  }),
  /** Object value (IRI or Literal) */
  object: RdfObject.annotations({
    title: "Object",
    description: "Object value (IRI or Literal)"
  }),
  /** When the assertion was created */
  assertedAt: Schema.DateTimeUtc.annotations({
    title: "Asserted At",
    description: "Timestamp when assertion was created"
  }),
  /** Claims this assertion was derived from */
  derivedFrom: Schema.Array(ClaimId).annotations({
    title: "Derived From",
    description: "Source claims this assertion was derived from"
  }),
  /** Curation status */
  status: AssertionStatus,
  /** Optional temporal validity start */
  validFrom: Schema.optional(Schema.DateTimeUtc).annotations({
    title: "Valid From",
    description: "Start of temporal validity period"
  }),
  /** Optional temporal validity end */
  validTo: Schema.optional(Schema.DateTimeUtc).annotations({
    title: "Valid To",
    description: "End of temporal validity period"
  })
}).annotations({
  title: "Assertion",
  description: "Normalized, curated RDF triple"
})
export type Assertion = typeof Assertion.Type

// =============================================================================
// DerivedAssertion
// =============================================================================

/**
 * DerivedAssertion - Inferred by reasoning
 *
 * A derived assertion is created by applying a reasoning rule
 * to existing assertions in the knowledge base.
 *
 * @example
 * ```typescript
 * const derived = {
 *   id: "derived-abc123def456" as DerivedAssertionId,
 *   assertion: { ... },
 *   ruleId: "rule-transitivity" as RuleId,
 *   supportingFacts: ["assertion-111..." as AssertionId, ...],
 *   derivedAt: new Date()
 * }
 * ```
 *
 * @since 2.0.0
 * @category DerivedAssertion
 */
export const DerivedAssertion = Schema.Struct({
  /** Unique derived assertion identifier */
  id: DerivedAssertionId,
  /** The inferred assertion */
  assertion: Assertion,
  /** Rule that produced this assertion */
  ruleId: RuleId,
  /** Assertions that support this derivation */
  supportingFacts: Schema.Array(AssertionId).annotations({
    title: "Supporting Facts",
    description: "Assertions used to derive this assertion"
  }),
  /** When the derivation was computed */
  derivedAt: Schema.DateTimeUtc.annotations({
    title: "Derived At",
    description: "Timestamp when derivation was computed"
  })
}).annotations({
  title: "Derived Assertion",
  description: "Assertion inferred by reasoning rule"
})
export type DerivedAssertion = typeof DerivedAssertion.Type

// =============================================================================
// Helper Constructors
// =============================================================================

/**
 * Create a ClaimId from a hash
 *
 * @since 2.0.0
 * @category Constructors
 */
export const claimIdFromHash = (hash: string): ClaimId =>
  `claim-${hash.slice(0, 12)}` as ClaimId

/**
 * Create an AssertionId from a hash
 *
 * @since 2.0.0
 * @category Constructors
 */
export const assertionIdFromHash = (hash: string): AssertionId =>
  `assertion-${hash.slice(0, 12)}` as AssertionId

/**
 * Create a DerivedAssertionId from a hash
 *
 * @since 2.0.0
 * @category Constructors
 */
export const derivedAssertionIdFromHash = (hash: string): DerivedAssertionId =>
  `derived-${hash.slice(0, 12)}` as DerivedAssertionId
