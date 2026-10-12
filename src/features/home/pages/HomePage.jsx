import { Container } from "@mui/material";
import { ListingGridSection } from "../sections/ListingGridSection";

export function HomePage() {
  return (
    <Container maxWidth="lg" sx={{ pt: { xs: 3, md: 4 }, pb: { xs: 6, md: 8 } }}>
      <ListingGridSection />
    </Container>
  );
}
