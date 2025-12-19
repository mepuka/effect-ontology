import type { ReactNode } from "react"
import { useState, useEffect } from "react"
import { Link, useLocation } from "react-router-dom"

interface AppShellProps {
  children: ReactNode
}

type HealthStatus = "checking" | "online" | "offline" | "degraded"

export function AppShell({ children }: AppShellProps) {
  const [health, setHealth] = useState<HealthStatus>("checking")
  const location = useLocation()

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch("/api/health/ready")
        if (res.ok) {
          const data = await res.json()
          setHealth(data.status === "ok" ? "online" : "degraded")
        } else {
          setHealth("offline")
        }
      } catch {
        setHealth("offline")
      }
    }

    checkHealth()
    const interval = setInterval(checkHealth, 30000)
    return () => clearInterval(interval)
  }, [])

  const healthColors: Record<HealthStatus, string> = {
    checking: "bg-gray-400",
    online: "bg-green-500",
    offline: "bg-red-500",
    degraded: "bg-amber-500"
  }

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + "/")

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
              <NavTab to="/ontologies" active={isActive("/ontologies")}>
                Schemas
              </NavTab>
              <NavTab to="/entities" active={isActive("/entities")}>
                Entities
              </NavTab>
              <NavTab to="/timeline" active={isActive("/timeline")}>
                Timeline
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
