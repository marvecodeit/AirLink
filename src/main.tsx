import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

// React StrictMode deliberately double-invokes effects in development. This
// app controls native WKWebView child layers and background monitor state, so
// a single mount is used to keep window creation deterministic.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
