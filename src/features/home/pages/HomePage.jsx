import { Container } from "@mui/material";
import { HeroSection } from "../sections/HeroSection";

export function HomePage() {
  return (
    <Container maxWidth="lg" sx={{ py: { xs: 8, md: 14 } }}>
      <HeroSection />
    </Container>
  );
}
