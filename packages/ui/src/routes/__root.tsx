import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'

export const Route = createRootRoute({
  component: () => (
    <div className="flex h-screen w-screen flex-col">
      {/* Top Navigation */}
      <nav className="flex items-center gap-4 border-b bg-card px-6 py-3">
        <h1 className="text-xl font-bold">Effect Ontology</h1>
        <div className="flex gap-2">
          <Link to="/" className="rounded px-3 py-2 hover:bg-accent" activeProps={{ className: 'bg-accent' }}>
            Home
          </Link>
          <Link to="/ontology" className="rounded px-3 py-2 hover:bg-accent" activeProps={{ className: 'bg-accent' }}>
            Ontology
          </Link>
          <Link to="/extractions" className="rounded px-3 py-2 hover:bg-accent" activeProps={{ className: 'bg-accent' }}>
            Extractions
          </Link>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>

      {/* Router Devtools (only in development) */}
      <TanStackRouterDevtools />
    </div>
  ),
})
