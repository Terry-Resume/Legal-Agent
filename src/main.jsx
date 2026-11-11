import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthShell } from '@kato8/core/react'
import { getTool, toolUrl } from '@kato8/core'
import './App.css'
import App from './App.jsx'

const demo = import.meta.env.VITE_KATO8_DEMO === '1'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* The shared Kato.8 gate: Clerk session + role (super_admin only, from the suite registry), or a role switcher in demo mode. */}
    <AuthShell
      appName="Legal Agent"
      roles={getTool('legal').roles}
      demo={demo}
      clerkPublishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
      hubUrl={toolUrl('hub', name => import.meta.env[name])}
      logoSrc="/kato8-icon.png"
    >
      <App />
    </AuthShell>
  </StrictMode>,
)
