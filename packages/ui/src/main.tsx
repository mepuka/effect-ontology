import React from "react"
import ReactDOM from "react-dom/client"
import { RegistryProvider } from "@effect-atom/atom-react"
import { App } from "./App"
import "./index.css"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RegistryProvider>
      <App />
    </RegistryProvider>
  </React.StrictMode>
)
