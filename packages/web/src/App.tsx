import { Routes, Route, Navigate } from "react-router-dom"
import { AppShell } from "./components/AppShell"
import { TimelinePage } from "./pages/TimelinePage"
import { OntologyIndex } from "./pages/OntologyIndex"
import { OntologyPage } from "./pages/OntologyPage"
import { OntologiesPage } from "./pages/OntologiesPage"
import { OntologySchemaPage } from "./pages/OntologySchemaPage"

export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/ontologies" replace />} />
        {/* Ontology schema browser */}
        <Route path="/ontologies" element={<OntologiesPage />} />
        <Route path="/ontologies/:id" element={<OntologySchemaPage />} />
        {/* Entity/facts browser (legacy routes) */}
        <Route path="/entities" element={<OntologyIndex />} />
        <Route path="/entities/:entityId" element={<OntologyPage />} />
        {/* Timeline */}
        <Route path="/timeline" element={<TimelinePage />} />
      </Routes>
    </AppShell>
  )
}
