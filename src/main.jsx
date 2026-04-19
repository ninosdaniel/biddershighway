import React from "react";
import ReactDOM from "react-dom/client";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import App from "./App";
import "./styles.css";

const theme = createTheme({
  palette: {
    primary: {
      main: "#193825",
      dark: "#10261a",
      light: "#315843",
      contrastText: "#f7f3ed",
    },
    secondary: {
      main: "#f39200",
    },
    background: {
      default: "#f7f3ed",
    },
  },
  shape: {
    borderRadius: 18,
  },
  typography: {
    fontFamily: '"Segoe UI", "Helvetica Neue", Arial, sans-serif',
    h1: {
      fontWeight: 800,
      letterSpacing: "-0.04em",
    },
    h2: {
      fontWeight: 700,
      letterSpacing: "-0.03em",
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
