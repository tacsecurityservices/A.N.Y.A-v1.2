import React from 'react';
import ReactDOM from 'react-dom/client';
// import './index.css'; // This line is commented out/removed as your app uses Tailwind CSS
import ANYA from './ANYA'; // Import your ANYA component (assuming you renamed App.js to ANYA.js)
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ANYA /> {/* Render your ANYA component here */}
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
