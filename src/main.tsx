import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { AppProvider } from './store/AppContext'
import { UiProvider } from './store/UiContext'
import { consumeSessionFromUrl } from './services/broker'

consumeSessionFromUrl() // ritorno dal login con il server: salva la sessione e ripulisce l'indirizzo

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <UiProvider>
        <App />
      </UiProvider>
    </AppProvider>
  </StrictMode>,
)
