import { AppBar, Container, Toolbar, Typography } from "@mui/material";

export function MainHeader() {
  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        backgroundColor: "primary.main",
        color: "#fff",
        borderBottom: "1px solid rgba(255, 255, 255, 0.14)",
      }}
    >
      <Container maxWidth="lg">
        <Toolbar disableGutters sx={{ minHeight: 78 }}>
          <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: "-0.02em" }}>
            Bidders Highway
          </Typography>
        </Toolbar>
      </Container>
    </AppBar>
  );
}
