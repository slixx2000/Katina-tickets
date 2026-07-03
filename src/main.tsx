import {ClerkProvider} from '@clerk/react';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const liveClerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const devClerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY_DEV;
const useDevClerkInstance = import.meta.env.DEV && import.meta.env.VITE_CLERK_USE_DEV_INSTANCE === 'true';
const clerkPublishableKey = useDevClerkInstance
  ? (devClerkPublishableKey || liveClerkPublishableKey)
  : (liveClerkPublishableKey || devClerkPublishableKey);

if (!clerkPublishableKey) {
  throw new Error('Missing Clerk publishable key. Set VITE_CLERK_PUBLISHABLE_KEY (or VITE_CLERK_PUBLISHABLE_KEY_DEV in development).');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider publishableKey={clerkPublishableKey}>
<App />
</ClerkProvider>
  </StrictMode>,
);