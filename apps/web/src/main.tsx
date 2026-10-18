import { ProcessingOverlay } from './components/ProcessingOverlay';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SystemDialogProvider } from './components/SystemDialog';
import { App } from './app/App';
import './design-system/styles.css';
const cache = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 10000 } },
});
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={cache}>
      <SystemDialogProvider>
        <App />
        <ProcessingOverlay />
      </SystemDialogProvider>
    </QueryClientProvider>
  </StrictMode>,
);
