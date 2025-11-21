import React from "react"
import ReactDOM from "react-dom/client"
import { RegistryProvider } from "@effect-atom/atom-react"
import { RouterProvider } from "@tanstack/react-router"
import { router } from "./router"
import "./index.css"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RegistryProvider>
      <RouterProvider router={router} />
    </RegistryProvider>
  </React.StrictMode>
)
