import { CssBaseline, ThemeProvider } from "@mui/material";
import { appTheme } from "../../theme/appTheme";

export function AppThemeProvider({ children }) {
  return (
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
