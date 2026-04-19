import { Box } from "@mui/material";
import { MainHeader } from "../components/layout/MainHeader";
import { HomePage } from "../features/home/pages/HomePage";

export function App() {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        backgroundColor: "background.default",
        color: "primary.dark",
      }}
    >
      <MainHeader />
      <HomePage />
    </Box>
  );
}
