import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Safely override HTMLMediaElement.prototype.play to handle AbortError (interrupted by unmounting or pause)
const originalPlay = HTMLMediaElement.prototype.play;
if (originalPlay) {
  HTMLMediaElement.prototype.play = function (...args) {
    const promise = originalPlay.apply(this, args);
    if (promise instanceof Promise) {
      promise.catch((error) => {
        if (error && error.name === 'AbortError') {
          // Play was interrupted by pause or element unmounting (safe to ignore)
          return;
        }
        console.warn("HTMLMediaElement.play() promise rejected:", error);
      });
    }
    return promise;
  };
}

// Catch and handle unhandled promise rejections / errors globally to suppress benign HMR and WebSocket warnings
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  if (reason) {
    const msg = typeof reason === 'string' ? reason : (reason.message || '');
    if (msg.includes('WebSocket') || msg.includes('websocket') || msg.includes('Vite') || msg.includes('HMR') || msg.includes('opened')) {
      event.preventDefault(); // Suppress browser error output/popups
      console.log('Suppressed benign unhandled promise rejection:', msg);
      return;
    }
  }
});

window.addEventListener('error', (event) => {
  const msg = event.message || '';
  if (msg.includes('WebSocket') || msg.includes('websocket') || msg.includes('Vite') || msg.includes('HMR') || msg.includes('opened')) {
    event.preventDefault(); // Suppress browser error output/popups
    console.log('Suppressed benign error:', msg);
    return;
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
