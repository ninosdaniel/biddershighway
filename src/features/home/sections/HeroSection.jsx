import ArrowForwardRounded from "@mui/icons-material/ArrowForwardRounded";
import { Box, Button, Stack, Typography } from "@mui/material";

export function HeroSection() {
  return (
    <Stack
      spacing={5}
      alignItems="center"
      textAlign="center"
      sx={{
        px: { xs: 1, md: 4 },
      }}
    >
      <Box
        component="img"
        src="/logo.svg"
        alt="Bidders Highway logo"
        sx={{
          width: { xs: 180, md: 240 },
          maxWidth: "100%",
          height: "auto",
        }}
      />

      <Stack spacing={2} alignItems="center">
        <Typography variant="h1" sx={{ fontSize: { xs: "2.7rem", md: "5rem" }, maxWidth: 860 }}>
          Enthusiast vehicles, presented with clarity.
        </Typography>
        <Typography
          variant="h5"
          color="text.secondary"
          sx={{ maxWidth: 700, lineHeight: 1.6, fontSize: { xs: "1.05rem", md: "1.4rem" } }}
        >
          A clean front page built with React and MUI, ready for your real logo and the next
          sections you want to add.
        </Typography>
      </Stack>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <Button size="large" variant="contained" endIcon={<ArrowForwardRounded />}>
          Explore Auctions
        </Button>
        <Button size="large" variant="outlined">
          Sell Your Vehicle
        </Button>
      </Stack>
    </Stack>
  );
}
