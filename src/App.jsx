import ArrowForwardRounded from "@mui/icons-material/ArrowForwardRounded";
import GavelRounded from "@mui/icons-material/GavelRounded";
import Inventory2Rounded from "@mui/icons-material/Inventory2Rounded";
import LocalShippingRounded from "@mui/icons-material/LocalShippingRounded";
import SellRounded from "@mui/icons-material/SellRounded";
import VerifiedRounded from "@mui/icons-material/VerifiedRounded";
import {
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Divider,
  Grid,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";

const navItems = ["Auctions", "How It Works", "Articles", "Sell With Us"];

const heroPoints = ["Verified listings", "Qualified buyers", "Smooth handover"];

const stats = [
  { value: "200K+", label: "monthly visitors" },
  { value: "30K+", label: "registered members" },
  { value: "150+", label: "images per listing" },
  { value: "250M SEK+", label: "monthly bidding volume" },
];

const liveLots = [
  {
    badge: "Reserve nearly reached",
    title: "1972 Porsche 911T Coupe",
    summary: "Well-kept touring spec with strong documentation and timeless proportions.",
    meta: "Ends tomorrow at 12:30",
    price: "760,000 SEK",
  },
  {
    badge: "Freshly listed",
    title: "1991 BMW M5 E34",
    summary: "Manual sports sedan with collector appeal and understated road presence.",
    meta: "Ends in 2 days",
    price: "215,000 SEK",
  },
  {
    badge: "Trending",
    title: "1968 Volvo Amazon 123 GT",
    summary: "Swedish icon presented as a weekend-ready classic with tasteful details.",
    meta: "Ends in 3 days",
    price: "148,000 SEK",
  },
];

const upcomingLots = [
  "1987 Mercedes-Benz 560 SEC",
  "2001 Ferrari 456M GTA",
  "1965 Ford Mustang Fastback",
];

const soldLots = [
  "1993 Mercedes-Benz 600 SL",
  "2020 Volkswagen Amarok Expedition Camper",
  "1953 Chevrolet 3600 Custom",
];

const sellSteps = [
  {
    icon: <Inventory2Rounded />,
    title: "Submit your vehicle",
    text: "Start with the registration number, contact details, and a few notes about the story behind it.",
  },
  {
    icon: <VerifiedRounded />,
    title: "Set the strategy",
    text: "We review the car together, establish expectations, and align on the reserve and launch plan.",
  },
  {
    icon: <SellRounded />,
    title: "Go live to buyers",
    text: "The listing is published with rich imagery and bidding runs in a focused, time-boxed window.",
  },
  {
    icon: <LocalShippingRounded />,
    title: "Close with confidence",
    text: "Winning bidder, payment flow, and handover are coordinated in a single guided process.",
  },
];

const productItems = [
  "Apparel and accessories",
  "Editorial highlights",
  "Community spotlights",
  "Partner promotions",
];

function SectionHeading({ eyebrow, title, description }) {
  return (
    <Stack spacing={1.5} sx={{ mb: 4 }}>
      <Typography
        variant="overline"
        sx={{ color: "secondary.main", fontWeight: 800, letterSpacing: "0.14em" }}
      >
        {eyebrow}
      </Typography>
      <Typography variant="h2" sx={{ fontSize: { xs: "2rem", md: "3rem" } }}>
        {title}
      </Typography>
      {description ? (
        <Typography color="text.secondary" sx={{ maxWidth: 720, lineHeight: 1.7 }}>
          {description}
        </Typography>
      ) : null}
    </Stack>
  );
}

function ListingCard({ badge, title, summary, meta, price }) {
  return (
    <Card
      elevation={0}
      sx={{
        height: "100%",
        border: "1px solid rgba(25, 56, 37, 0.14)",
        backgroundColor: "rgba(255, 255, 255, 0.9)",
      }}
    >
      <Box
        sx={{
          aspectRatio: "4 / 3",
          background:
            "linear-gradient(135deg, rgba(25, 56, 37, 0.9), rgba(49, 88, 67, 0.55)), linear-gradient(45deg, rgba(243, 146, 0, 0.18), transparent)",
        }}
      />
      <CardContent sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Chip
            label={badge}
            size="small"
            sx={{
              alignSelf: "flex-start",
              backgroundColor: "rgba(243, 146, 0, 0.14)",
              color: "primary.dark",
              fontWeight: 700,
            }}
          />
          <Typography variant="h5">{title}</Typography>
          <Typography color="text.secondary" sx={{ lineHeight: 1.7 }}>
            {summary}
          </Typography>
          <Divider />
          <Stack direction="row" justifyContent="space-between" spacing={2}>
            <Typography variant="body2" color="text.secondary">
              {meta}
            </Typography>
            <Typography fontWeight={800}>{price}</Typography>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

function SimpleLotCard({ title, tone }) {
  return (
    <Card
      elevation={0}
      sx={{
        border: "1px solid rgba(25, 56, 37, 0.12)",
        backgroundColor: tone,
      }}
    >
      <CardContent sx={{ p: 3 }}>
        <Stack spacing={1.5}>
          <Box
            sx={{
              height: 180,
              borderRadius: 3,
              background:
                "linear-gradient(140deg, rgba(25, 56, 37, 0.88), rgba(243, 146, 0, 0.25))",
            }}
          />
          <Typography variant="h6">{title}</Typography>
          <Typography color="text.secondary">
            Structured like the live marketplace sections, ready for real data later.
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function App() {
  return (
    <Box sx={{ backgroundColor: "background.default", color: "primary.dark" }}>
      <AppBar
        position="sticky"
        elevation={0}
        color="transparent"
        sx={{
          backdropFilter: "blur(18px)",
          backgroundColor: "rgba(25, 56, 37, 0.94)",
          color: "#ffffff",
          borderBottom: "1px solid rgba(247, 243, 237, 0.12)",
        }}
      >
        <Container maxWidth="xl">
          <Toolbar disableGutters sx={{ minHeight: 80, gap: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 900, flexGrow: 1 }}>
              Bidders Highway
            </Typography>
            <Stack direction="row" spacing={3} sx={{ display: { xs: "none", md: "flex" } }}>
              {navItems.map((item) => (
                <Typography key={item} sx={{ fontWeight: 600 }}>
                  {item}
                </Typography>
              ))}
            </Stack>
            <Stack direction="row" spacing={1.5}>
              <Button color="inherit">Log in</Button>
              <Button
                variant="contained"
                sx={{
                  backgroundColor: "#ffffff",
                  color: "primary.main",
                  "&:hover": {
                    backgroundColor: "rgba(255, 255, 255, 0.88)",
                  },
                }}
              >
                Create account
              </Button>
            </Stack>
          </Toolbar>
        </Container>
      </AppBar>

      <Box
        component="section"
        sx={{
          pt: { xs: 6, md: 10 },
          pb: { xs: 7, md: 10 },
          background:
            "radial-gradient(circle at top left, rgba(243, 146, 0, 0.15), transparent 26%), radial-gradient(circle at top right, rgba(25, 56, 37, 0.16), transparent 30%)",
        }}
      >
        <Container maxWidth="xl">
          <Grid container spacing={5} alignItems="center">
            <Grid size={{ xs: 12, md: 6 }}>
              <Stack spacing={3}>
                <Chip
                  label="Marketplace structure inspired by biddershighway.com"
                  sx={{
                    alignSelf: "flex-start",
                    backgroundColor: "rgba(25, 56, 37, 0.1)",
                    color: "primary.main",
                    fontWeight: 800,
                  }}
                />
                <Typography variant="h1" sx={{ fontSize: { xs: "3rem", md: "5.25rem" } }}>
                  Sell enthusiast vehicles through a premium auction flow.
                </Typography>
                <Typography
                  variant="h5"
                  color="text.secondary"
                  sx={{ maxWidth: 680, lineHeight: 1.55 }}
                >
                  This homepage now follows the same section rhythm as the live Bidders
                  Highway experience: hero, stats, live lots, upcoming inventory, sold
                  highlights, seller onboarding, and a product-led footer.
                </Typography>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <Button
                    size="large"
                    variant="contained"
                    endIcon={<ArrowForwardRounded />}
                  >
                    Start selling
                  </Button>
                  <Button size="large" variant="outlined">
                    Browse auctions
                  </Button>
                </Stack>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} useFlexGap flexWrap="wrap">
                  {heroPoints.map((point) => (
                    <Chip
                      key={point}
                      label={point}
                      icon={<GavelRounded />}
                      variant="outlined"
                      sx={{ px: 1, borderColor: "rgba(25, 56, 37, 0.18)" }}
                    />
                  ))}
                </Stack>
              </Stack>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Card
                elevation={0}
                sx={{
                  borderRadius: 6,
                  overflow: "hidden",
                  border: "1px solid rgba(25, 56, 37, 0.14)",
                  boxShadow: "0 30px 80px rgba(25, 56, 37, 0.12)",
                }}
              >
                <Box
                  sx={{
                    minHeight: 520,
                    p: { xs: 3, md: 4 },
                    display: "grid",
                    alignContent: "space-between",
                    background:
                      "linear-gradient(160deg, rgba(20, 34, 26, 0.96), rgba(25, 56, 37, 0.92))",
                    color: "#f7f3ed",
                  }}
                >
                  <Stack spacing={2}>
                    <Typography variant="overline" sx={{ opacity: 0.72, letterSpacing: "0.14em" }}>
                      Live now
                    </Typography>
                    <Typography variant="h3" sx={{ maxWidth: 420 }}>
                      Featured auction spotlight
                    </Typography>
                  </Stack>
                  <Stack spacing={2}>
                    <Typography variant="h5">2000 Mercedes-Benz CL 600</Typography>
                    <Typography sx={{ opacity: 0.8, maxWidth: 460, lineHeight: 1.7 }}>
                      A hero media panel stands here on the live site. We keep the same
                      structural role, but with an original implementation in MUI.
                    </Typography>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography sx={{ opacity: 0.72 }}>Closes tomorrow 12:30</Typography>
                      <Typography fontWeight={800}>120,000 SEK</Typography>
                    </Stack>
                  </Stack>
                </Box>
              </Card>
            </Grid>
          </Grid>
        </Container>
      </Box>

      <Container maxWidth="xl" sx={{ py: { xs: 6, md: 8 } }}>
        <Grid container spacing={2}>
          {stats.map((stat) => (
            <Grid key={stat.label} size={{ xs: 6, md: 3 }}>
              <Card
                elevation={0}
                sx={{
                  height: "100%",
                  border: "1px solid rgba(25, 56, 37, 0.12)",
                  backgroundColor: "rgba(255, 255, 255, 0.66)",
                }}
              >
                <CardContent sx={{ p: 3.25 }}>
                  <Typography variant="h4" sx={{ fontWeight: 900, mb: 1 }}>
                    {stat.value}
                  </Typography>
                  <Typography color="text.secondary">{stat.label}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>

      <Box component="section" sx={{ py: { xs: 6, md: 8 } }}>
        <Container maxWidth="xl">
          <SectionHeading
            eyebrow="Live"
            title="Current auctions"
            description="This section mirrors the live marketplace placement: a high-priority inventory band featuring active listings and quick-glance bidding details."
          />
          <Grid container spacing={3}>
            {liveLots.map((lot) => (
              <Grid key={lot.title} size={{ xs: 12, md: 4 }}>
                <ListingCard {...lot} />
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      <Box component="section" sx={{ py: { xs: 6, md: 8 }, backgroundColor: "rgba(255, 255, 255, 0.52)" }}>
        <Container maxWidth="xl">
          <SectionHeading
            eyebrow="Coming Soon"
            title="Upcoming listings"
            description="The live site follows its current auctions with a second inventory rail for auctions that are about to open. This block keeps that same role in the page flow."
          />
          <Grid container spacing={3}>
            {upcomingLots.map((title) => (
              <Grid key={title} size={{ xs: 12, md: 4 }}>
                <SimpleLotCard title={title} tone="rgba(25, 56, 37, 0.04)" />
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      <Box component="section" sx={{ py: { xs: 6, md: 8 } }}>
        <Container maxWidth="xl">
          <SectionHeading
            eyebrow="Recently Sold"
            title="Closed highlights"
            description="After upcoming inventory, the homepage transitions into proof of marketplace activity. These cards are placeholders for recently completed auctions."
          />
          <Grid container spacing={3}>
            {soldLots.map((title) => (
              <Grid key={title} size={{ xs: 12, md: 4 }}>
                <SimpleLotCard title={title} tone="rgba(243, 146, 0, 0.05)" />
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      <Box
        component="section"
        sx={{
          py: { xs: 7, md: 10 },
          background:
            "linear-gradient(180deg, rgba(25, 56, 37, 0.98) 0%, rgba(16, 38, 26, 1) 100%)",
          color: "#f7f3ed",
        }}
      >
        <Container maxWidth="xl">
          <SectionHeading
            eyebrow="Sell With Us"
            title="A guided seller journey"
            description="The live site dedicates a full section to explaining how sellers move from first contact to finished auction. This keeps the same structural function with original wording."
          />
          <Grid container spacing={3}>
            {sellSteps.map((step) => (
              <Grid key={step.title} size={{ xs: 12, sm: 6, md: 3 }}>
                <Card
                  elevation={0}
                  sx={{
                    height: "100%",
                    backgroundColor: "rgba(255, 255, 255, 0.06)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    color: "inherit",
                  }}
                >
                  <CardContent sx={{ p: 3.5 }}>
                    <Stack spacing={2}>
                      <Box
                        sx={{
                          width: 56,
                          height: 56,
                          borderRadius: 3,
                          display: "grid",
                          placeItems: "center",
                          backgroundColor: "rgba(243, 146, 0, 0.16)",
                          color: "secondary.main",
                        }}
                      >
                        {step.icon}
                      </Box>
                      <Typography variant="h6">{step.title}</Typography>
                      <Typography sx={{ opacity: 0.78, lineHeight: 1.7 }}>
                        {step.text}
                      </Typography>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      <Box component="section" sx={{ py: { xs: 6, md: 8 } }}>
        <Container maxWidth="xl">
          <SectionHeading
            eyebrow="Products"
            title="Brand extensions and editorial space"
            description="Near the footer, biddershighway.com broadens the page from auctions into products and lifestyle content. This section reserves the same territory for your project."
          />
          <Grid container spacing={3}>
            {productItems.map((item) => (
              <Grid key={item} size={{ xs: 12, sm: 6, md: 3 }}>
                <Card
                  elevation={0}
                  sx={{
                    height: "100%",
                    border: "1px solid rgba(25, 56, 37, 0.12)",
                    backgroundColor: "rgba(255, 255, 255, 0.72)",
                  }}
                >
                  <CardContent sx={{ p: 3.25 }}>
                    <Stack spacing={2}>
                      <Box
                        sx={{
                          aspectRatio: "1 / 1",
                          borderRadius: 4,
                          background:
                            "linear-gradient(135deg, rgba(243, 146, 0, 0.35), rgba(25, 56, 37, 0.8))",
                        }}
                      />
                      <Typography variant="h6">{item}</Typography>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      <Box component="footer" sx={{ backgroundColor: "primary.dark", color: "#f7f3ed", pt: 8, pb: 5 }}>
        <Container maxWidth="xl">
          <Grid container spacing={4} sx={{ mb: 4 }}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Typography variant="h5" sx={{ fontWeight: 900, mb: 2 }}>
                Bidders Highway
              </Typography>
              <Typography sx={{ opacity: 0.72, maxWidth: 360, lineHeight: 1.7 }}>
                Footer layout kept in the same spirit as the live site: brand block first,
                then grouped navigation columns.
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 8 }}>
              <Grid container spacing={3}>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <Typography sx={{ fontWeight: 800, mb: 1.5 }}>Auctions</Typography>
                  <Stack spacing={1} sx={{ opacity: 0.72 }}>
                    <Typography>Live</Typography>
                    <Typography>Sold</Typography>
                    <Typography>Buy Now</Typography>
                  </Stack>
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <Typography sx={{ fontWeight: 800, mb: 1.5 }}>Help</Typography>
                  <Stack spacing={1} sx={{ opacity: 0.72 }}>
                    <Typography>FAQ</Typography>
                    <Typography>Cookie policy</Typography>
                    <Typography>Terms</Typography>
                  </Stack>
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <Typography sx={{ fontWeight: 800, mb: 1.5 }}>Company</Typography>
                  <Stack spacing={1} sx={{ opacity: 0.72 }}>
                    <Typography>About</Typography>
                    <Typography>Contact</Typography>
                    <Typography>Careers</Typography>
                  </Stack>
                </Grid>
              </Grid>
            </Grid>
          </Grid>
          <Divider sx={{ borderColor: "rgba(247, 243, 237, 0.12)", mb: 3 }} />
          <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} justifyContent="space-between" sx={{ opacity: 0.55 }}>
            <Typography variant="body2">© 2026 Bidders Highway</Typography>
            <Typography variant="body2">Stockholm, Sweden</Typography>
            <Typography variant="body2">Built with React and MUI</Typography>
          </Stack>
        </Container>
      </Box>
    </Box>
  );
}
