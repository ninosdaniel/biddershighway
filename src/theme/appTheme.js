import { createTheme } from "@mui/material";

export const appTheme = createTheme({
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
