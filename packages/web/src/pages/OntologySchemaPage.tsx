import { useParams, Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"

interface VocabularyRef {
  iri: string
  prefix: string
  name: string
  publisher?: string
  specUrl?: string
}

interface ClassSummary {
  iri: string
  localName: string
  label?: string
  comment?: string
  superClass?: string
}

interface PropertySummary {
  iri: string
  localName: string
  label?: string
  comment?: string
  domain?: string
  range?: string
  isObjectProperty: boolean
}

interface OntologyDetail {
  id: string
  iri: string
  title: string
  description?: string
  version: string
  creator?: string
  created?: string
  targetNamespace: string
  imports: VocabularyRef[]
  classes: ClassSummary[]
  properties: PropertySummary[]
  seeAlso: string[]
}

function localName(iri: string): string {
  const match = iri.match(/[#/]([^#/]+)$/)
  return match ? match[1] : iri
}

function prefixFromIri(iri: string, imports: VocabularyRef[]): string | null {
  for (const vocab of imports) {
    if (iri.startsWith(vocab.iri.replace(/#$/, ""))) {
      return vocab.prefix
    }
  }
  return null
}

function ImportCard({ vocab }: { vocab: VocabularyRef }) {
  return (
    <div className="border border-stone-200 bg-white px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <code className="text-sm font-mono font-medium text-amber-700">
          {vocab.prefix}:
        </code>
        {vocab.publisher && (
          <span className="text-xs text-stone-400">{vocab.publisher}</span>
        )}
      </div>
      <p className="text-sm text-stone-700 mt-1">{vocab.name}</p>
      {vocab.specUrl && (
        <a
          href={vocab.specUrl}
          target="_blank"
          rel="noopener"
          className="text-xs text-blue-600 hover:text-blue-800 hover:underline mt-1 inline-block"
        >
          Specification →
        </a>
      )}
    </div>
  )
}

function ClassRow({ cls, imports }: { cls: ClassSummary; imports: VocabularyRef[] }) {
  const superPrefix = cls.superClass ? prefixFromIri(cls.superClass, imports) : null
  const superLocal = cls.superClass ? localName(cls.superClass) : null

  return (
    <tr className="border-b border-stone-100 hover:bg-stone-50/50">
      <td className="py-3 pr-4 align-top">
        <code className="text-sm font-mono text-emerald-700">{cls.localName}</code>
      </td>
      <td className="py-3 pr-4 align-top">
        {cls.superClass && (
          <code className="text-xs font-mono text-stone-500">
            {superPrefix ? `${superPrefix}:${superLocal}` : superLocal}
          </code>
        )}
      </td>
      <td className="py-3 align-top text-sm text-stone-600 max-w-md">
        {cls.comment || <span className="text-stone-300">—</span>}
      </td>
    </tr>
  )
}

function PropertyRow({ prop }: { prop: PropertySummary }) {
  return (
    <tr className="border-b border-stone-100 hover:bg-stone-50/50">
      <td className="py-3 pr-4 align-top">
        <code className="text-sm font-mono text-blue-700">{prop.localName}</code>
      </td>
      <td className="py-3 pr-4 align-top">
        <span className={`text-xs px-1.5 py-0.5 rounded ${
          prop.isObjectProperty
            ? "bg-violet-100 text-violet-700"
            : "bg-stone-100 text-stone-600"
        }`}>
          {prop.isObjectProperty ? "Object" : "Datatype"}
        </span>
      </td>
      <td className="py-3 align-top text-sm text-stone-600 max-w-md">
        {prop.comment || <span className="text-stone-300">—</span>}
      </td>
    </tr>
  )
}

export function OntologySchemaPage() {
  const { id } = useParams<{ id: string }>()

  const { data, isLoading, error } = useQuery<OntologyDetail>({
    queryKey: ["ontology", id],
    queryFn: async () => {
      const res = await fetch(`/api/v1/ontologies/${id}`)
      if (!res.ok) {
        if (res.status === 404) throw new Error("Ontology not found")
        throw new Error(`Failed to fetch: ${res.status}`)
      }
      return res.json()
    },
    enabled: !!id
  })

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto py-16 text-center text-stone-500">
        Loading ontology schema...
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="border-l-4 border-red-400 bg-red-50 p-4">
          <p className="text-red-800 text-sm">
            {error instanceof Error ? error.message : "Failed to load ontology"}
          </p>
        </div>
        <Link to="/ontologies" className="text-sm text-blue-600 hover:underline mt-4 inline-block">
          ← Back to ontologies
        </Link>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <nav className="mb-6">
        <Link
          to="/ontologies"
          className="text-sm text-stone-500 hover:text-amber-700 hover:underline"
        >
          ← Ontologies
        </Link>
      </nav>

      {/* Header */}
      <header className="mb-10 border-b border-stone-200 pb-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl text-stone-900 mb-2">
              {data.title}
            </h1>
            <code className="text-sm font-mono text-stone-500 break-all">
              {data.iri}
            </code>
          </div>
          <span className="text-sm font-mono text-stone-400 bg-stone-100 px-3 py-1 rounded shrink-0">
            v{data.version}
          </span>
        </div>

        {data.description && (
          <p className="text-stone-600 mt-4 leading-relaxed max-w-2xl">
            {data.description}
          </p>
        )}

        <dl className="grid grid-cols-2 gap-x-8 gap-y-2 mt-6 text-sm">
          <div className="flex gap-2">
            <dt className="text-stone-400">Namespace:</dt>
            <dd className="font-mono text-stone-600 truncate">{data.targetNamespace}</dd>
          </div>
          {data.creator && (
            <div className="flex gap-2">
              <dt className="text-stone-400">Creator:</dt>
              <dd className="text-stone-600">{data.creator}</dd>
            </div>
          )}
          {data.created && (
            <div className="flex gap-2">
              <dt className="text-stone-400">Created:</dt>
              <dd className="text-stone-600">{data.created}</dd>
            </div>
          )}
        </dl>
      </header>

      {/* Imports */}
      <section className="mb-10">
        <h2 className="text-xs font-mono uppercase tracking-widest text-stone-400 mb-4">
          Imported Vocabularies ({data.imports.length})
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {data.imports.map((vocab) => (
            <ImportCard key={vocab.iri} vocab={vocab} />
          ))}
        </div>
      </section>

      {/* Classes */}
      {data.classes.length > 0 && (
        <section className="mb-10">
          <h2 className="text-xs font-mono uppercase tracking-widest text-stone-400 mb-4">
            Domain Classes ({data.classes.length})
          </h2>
          <div className="border border-stone-200 rounded overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200">
                  <th className="py-2 px-4 text-xs font-mono uppercase tracking-wide text-stone-500">
                    Class
                  </th>
                  <th className="py-2 px-4 text-xs font-mono uppercase tracking-wide text-stone-500">
                    Extends
                  </th>
                  <th className="py-2 px-4 text-xs font-mono uppercase tracking-wide text-stone-500">
                    Description
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.classes.map((cls) => (
                  <ClassRow key={cls.iri} cls={cls} imports={data.imports} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Properties */}
      {data.properties.length > 0 && (
        <section className="mb-10">
          <h2 className="text-xs font-mono uppercase tracking-widest text-stone-400 mb-4">
            Properties ({data.properties.length})
          </h2>
          <div className="border border-stone-200 rounded overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200">
                  <th className="py-2 px-4 text-xs font-mono uppercase tracking-wide text-stone-500">
                    Property
                  </th>
                  <th className="py-2 px-4 text-xs font-mono uppercase tracking-wide text-stone-500">
                    Type
                  </th>
                  <th className="py-2 px-4 text-xs font-mono uppercase tracking-wide text-stone-500">
                    Description
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.properties.map((prop) => (
                  <PropertyRow key={prop.iri} prop={prop} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* See Also */}
      {data.seeAlso.length > 0 && (
        <section className="mb-10">
          <h2 className="text-xs font-mono uppercase tracking-widest text-stone-400 mb-3">
            References
          </h2>
          <ul className="space-y-1">
            {data.seeAlso.map((url) => (
              <li key={url}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener"
                  className="text-sm text-blue-600 hover:text-blue-800 hover:underline font-mono"
                >
                  {url}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
