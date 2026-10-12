import ArrowForwardRounded from "@mui/icons-material/ArrowForwardRounded";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  Typography,
} from "@mui/material";

const featuredCar = {
  title: "1941 Ford Super De Luxe Cabriolet",
  eyebrow: "Featured Auction",
  description:
    "A more dramatic open-top classic from the current Bidders Highway homepage, with pre-war presence and a far stronger hero image.",
  image:
    "https://bidders-highway.fra1.cdn.digitaloceanspaces.com/3aff5ee8535aa83b765a45e837d4705a",
};

const supportingImages = [
  {
    title: "Classic Volvo collection",
    image:
      "https://scontent-sof1-2.cdninstagram.com/v/t51.82787-15/670193128_18070852694672093_6907046810386189208_n.jpg?stp=dst-jpg_e35_tt6&_nc_cat=110&ccb=7-5&_nc_sid=18de74&efg=eyJlZmdfdGFnIjoiQ0FST1VTRUxfSVRFTS5iZXN0X2ltYWdlX3VybGdlbi5DMyJ9&_nc_ohc=LdGJa7S-234Q7kNvwGpJcK4&_nc_oc=AdoxAKNbR93CiU7mbkxv8QezAoLE_57tKE7n039Y8Br8oALc3yjCrKVDVFBrX7w5KtGcY4XLEAlnnPQcw7OZ_OBe&_nc_zt=23&_nc_ht=scontent-sof1-2.cdninstagram.com&edm=ANo9K5cEAAAA&_nc_gid=H9SgYCgx7GCpDVRhrJFjPw&_nc_tpa=Q5bMBQHOizeJthQpwfF61dodhl42Rh-C4MEfT_Mm9b9WCGv3AXpndKmEzgEqdc9VvF4tT2ufMr3QZ9Pt4Q&oh=00_Af2GCqQz24_guObCjqZWrQZunY4Nj59B8AeXu0TdRJnQMg&oe=69E89964",
  },
  {
    title: "Summer selection",
    image:
      "https://scontent-sof1-1.cdninstagram.com/v/t51.82787-15/671784192_18070440530672093_8905481528282943925_n.jpg?stp=dst-jpg_e35_tt6&_nc_cat=106&ccb=7-5&_nc_sid=18de74&efg=eyJlZmdfdGFnIjoiQ0FST1VTRUxfSVRFTS5iZXN0X2ltYWdlX3VybGdlbi5DMyJ9&_nc_ohc=VGkEUlp0aMwQ7kNvwGu3Bx2&_nc_oc=Adrf5AIz3flcoDecLtiZlaVed6apylwCxuxqQ3h7e1-jyOgZ0Amcam66P8FeLrIMMCFYecbEY1jcSTTmGs_uzYEN&_nc_zt=23&_nc_ht=scontent-sof1-1.cdninstagram.com&edm=ANo9K5cEAAAA&_nc_gid=H9SgYCgx7GCpDVRhrJFjPw&_nc_tpa=Q5bMBQHO2VvXME2alrbJcBekgw7UONpxqatLMDeRy3V7ql2CWp4mYueJrlUZ_q6K50DeBM4QgJ4G44wBSg&oh=00_Af2u-FeMG6Yr5RS2PXIPwlUy2J8BmrztIx9c55ik-M2YNg&oe=69E886E8",
  },
];

export function HeroSection() {
  return (
    <Stack
      spacing={5}
      alignItems="center"
      textAlign="left"
      sx={{
        px: { xs: 1, md: 4 },
        alignItems: "flex-start",
      }}
    >
      <Typography variant="h3" sx={{ color: "primary.main", maxWidth: 860 }}>
        Cars for sale and auctions
      </Typography>

      <Card
        elevation={0}
        sx={{
          width: "100%",
          overflow: "hidden",
          borderRadius: "15px",
          border: "1px solid rgba(25, 56, 37, 0.12)",
          boxShadow: "0 20px 50px rgba(16, 38, 26, 0.12)",
        }}
      >
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1.7fr) minmax(280px, 0.9fr)" },
            gap: 0,
          }}
        >
          <Box
            sx={{
              minHeight: { xs: 260, md: 320 },
              display: "grid",
              alignItems: "end",
              backgroundImage: `linear-gradient(180deg, rgba(16, 38, 26, 0.08) 0%, rgba(16, 38, 26, 0.82) 100%), url("${featuredCar.image}")`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            <CardContent sx={{ p: { xs: 3, md: 5 } }}>
              <Stack spacing={2} sx={{ maxWidth: 520 }}>
                <Chip
                  label={featuredCar.eyebrow}
                  sx={{
                    alignSelf: "flex-start",
                    backgroundColor: "secondary.main",
                    color: "#fff",
                    fontWeight: 700,
                  }}
                />
                <Typography variant="h2" sx={{ color: "#fff" }}>
                  {featuredCar.title}
                </Typography>
                <Typography sx={{ color: "rgba(255, 255, 255, 0.86)", lineHeight: 1.7 }}>
                  {featuredCar.description}
                </Typography>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <Button variant="contained" endIcon={<ArrowForwardRounded />}>
                    View Listing
                  </Button>
                  <Button
                    variant="outlined"
                    sx={{
                      borderColor: "rgba(255, 255, 255, 0.7)",
                      color: "#fff",
                      "&:hover": {
                        borderColor: "#fff",
                        backgroundColor: "rgba(255, 255, 255, 0.08)",
                      },
                    }}
                  >
                    More Featured Cars
                  </Button>
                </Stack>
              </Stack>
            </CardContent>
          </Box>

          <Stack
            spacing={0}
            sx={{
              backgroundColor: "rgba(16, 38, 26, 0.04)",
              borderLeft: { xs: "none", md: "1px solid rgba(25, 56, 37, 0.1)" },
            }}
          >
            {supportingImages.map((item) => (
              <Box
                key={item.title}
                sx={{
                  flex: 1,
                  minHeight: { xs: 130, md: 160 },
                  position: "relative",
                  backgroundImage: `linear-gradient(180deg, rgba(16, 38, 26, 0.06) 0%, rgba(16, 38, 26, 0.68) 100%), url("${item.image}")`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  borderTop: "1px solid rgba(25, 56, 37, 0.1)",
                  "&:first-of-type": {
                    borderTop: "none",
                  },
                }}
              >
                <Box
                  sx={{
                    position: "absolute",
                    inset: "auto 0 0 0",
                    p: 2.5,
                  }}
                >
                  <Typography sx={{ color: "#fff", fontWeight: 700 }}>{item.title}</Typography>
                </Box>
              </Box>
            ))}
          </Stack>
        </Box>
      </Card>
    </Stack>
  );
}
