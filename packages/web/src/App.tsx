import { Routes, Route } from "react-router-dom"
import { AppShell } from "./components/AppShell"
import { BatchMonitor } from "./pages/BatchMonitor"

export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<BatchMonitor />} />
      </Routes>
    </AppShell>
  )
}
