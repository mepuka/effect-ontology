import type { ReactNode } from "react"
import { useState, useEffect } from "react"

interface AppShellProps {
  children: ReactNode
}

type HealthStatus = "checking" | "online" | "offline" | "degraded"

export function AppShell({ children }: AppShellProps) {
  const [health, setHealth] = useState<HealthStatus>("checking")

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
    const interval = setInterval(checkHealth, 30000) // Check every 30s
    return () => clearInterval(interval)
  }, [])

  const healthColors: Record<HealthStatus, string> = {
    checking: "bg-gray-500",
    online: "bg-emerald-500",
    offline: "bg-red-500",
    degraded: "bg-amber-500"
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 border-r border-gray-800 bg-gray-900">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-6 border-b border-gray-800">
            <h1 className="font-mono text-lg font-bold text-white">
              Effect Ontology
            </h1>
            <p className="text-xs text-gray-500 font-mono mt-1">
              Batch Extraction API
            </p>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4">
            <div className="px-4 py-3 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <div className="flex items-center gap-3">
                <BatchIcon />
                <span className="font-medium text-sm">Batch Monitor</span>
              </div>
            </div>
          </nav>

          {/* Status Footer */}
          <div className="p-4 border-t border-gray-800">
            <div className="bg-gray-800/50 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">API Status</span>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${healthColors[health]}`} />
                  <span className="text-xs text-gray-400 font-mono capitalize">
                    {health}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-gray-950">
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  )
}

function BatchIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2 2 4-4" />
    </svg>
  )
}
