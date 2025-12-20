import type { ReactNode } from "react"
import { Link, useLocation } from "react-router-dom"
import { useAtomValue } from "@effect-atom/atom-react"
import { Result } from "@effect-atom/atom"
import { healthAtom } from "@/atoms/api"
import { linksLink, documentsLink, timelineLink, classesLink, entitiesLink } from "../lib/routing"

interface AppShellProps {
  children: ReactNode
}

type HealthStatus = "checking" | "online" | "offline" | "degraded"

/**
 * Extract ontology ID from current path
 */
function useOntologyId(): string | null {
  const location = useLocation()
  const match = location.pathname.match(/^\/o\/([^/]+)/)
  return match ? match[1] : null
}

/**
 * Derive health status from atom result
 */
function useHealthStatus(): HealthStatus {
  const result = useAtomValue(healthAtom)

  if (result.waiting) return "checking"

  return Result.match(result, {
    onInitial: () => "checking" as HealthStatus,
    onFailure: () => "offline" as HealthStatus,
    onSuccess: (s) => (s.value.status === "ok" ? "online" : "degraded") as HealthStatus
  })
}

export function AppShell({ children }: AppShellProps) {
  const health = useHealthStatus()
  const location = useLocation()
  const ontologyId = useOntologyId()

  const healthColors: Record<HealthStatus, string> = {
    checking: "bg-gray-400",
    online: "bg-green-500",
    offline: "bg-red-500",
    degraded: "bg-amber-500"
  }

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + "/")

  // Build ontology-scoped nav links
  const scopedLinks = ontologyId ? {
    links: linksLink(ontologyId),
    documents: documentsLink(ontologyId),
    timeline: timelineLink(ontologyId),
    classes: classesLink(ontologyId),
    entities: entitiesLink(ontologyId)
  } : {
    links: "/o/seattle/links",
    documents: "/o/seattle/documents",
    timeline: "/o/seattle/timeline",
    classes: "/o/seattle/classes",
    entities: "/o/seattle/entities"
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Top header bar */}
      <header className="border-b border-gray-200 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            {/* Logo / Title */}
            <Link to="/" className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
                <span className="text-white font-bold text-sm">EO</span>
              </div>
              <div>
                <h1 className="text-lg font-semibold text-gray-900 leading-tight">
                  Effect Ontology
                </h1>
                <p className="text-xs text-gray-500 -mt-0.5">Knowledge Graph</p>
              </div>
            </Link>

            {/* Navigation tabs */}
            <nav className="flex items-center gap-1">
              {ontologyId && (
                <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded mr-2">
                  {ontologyId}
                </span>
              )}
              <NavTab to={scopedLinks.links} active={isActive(scopedLinks.links) || isActive("/links")}>
                Links
              </NavTab>
              <NavTab to={scopedLinks.documents} active={isActive(scopedLinks.documents) || isActive("/documents")}>
                Documents
              </NavTab>
              <NavTab to={scopedLinks.timeline} active={isActive(scopedLinks.timeline) || isActive("/timeline")}>
                Timeline
              </NavTab>
              <NavTab to={scopedLinks.classes} active={isActive(scopedLinks.classes) || isActive("/ontologies")}>
                Schemas
              </NavTab>
              <NavTab to={scopedLinks.entities} active={isActive(scopedLinks.entities) || isActive("/entities")}>
                Entities
              </NavTab>
              <NavTab to="/ontologies" active={location.pathname === "/ontologies"}>
                Switch
              </NavTab>
            </nav>

            {/* Status indicator */}
            <div className="flex items-center gap-2 text-sm">
              <div className={`w-2 h-2 rounded-full ${healthColors[health]}`} />
              <span className="text-gray-500 text-xs">
                {health === "online" ? "Connected" : health}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="py-6 px-4">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-gray-50 mt-12">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <div className="flex items-center gap-4">
              <span>Effect Ontology</span>
              <span>•</span>
              <span>Built with Effect-TS</span>
            </div>
            <div>
              Data licensed under{" "}
              <a href="https://creativecommons.org/licenses/by-sa/4.0/" className="text-blue-600 hover:underline">
                CC BY-SA 4.0
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

function NavTab({ to, active, children }: { to: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      to={to}
      className={`px-4 py-2 text-sm rounded-t border-b-2 transition-colors ${
        active
          ? "border-blue-600 text-blue-700 bg-white -mb-px"
          : "border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100"
      }`}
    >
      {children}
    </Link>
  )
}
