import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
// Onest font is bundled with the app, so it works on an office network without internet
import '@fontsource/onest/400.css';
import '@fontsource/onest/500.css';
import '@fontsource/onest/600.css';
import '@fontsource/onest/700.css';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
