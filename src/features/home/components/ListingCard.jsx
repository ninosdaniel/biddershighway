import PlaceOutlined from "@mui/icons-material/PlaceOutlined";
import {
  Box,
  Card,
  CardContent,
  Chip,
  Stack,
  Typography,
} from "@mui/material";

export function ListingCard({ listing }) {
  const tone = listing.type === "classified" ? "secondary.main" : "primary.main";
  const typeLabel = listing.type === "classified" ? "Classified" : "Auction";

  return (
    <Card
      elevation={0}
      sx={{
        height: "100%",
        overflow: "hidden",
        borderRadius: "15px",
        border: "1px solid rgba(25, 56, 37, 0.12)",
        boxShadow: "0 16px 35px rgba(16, 38, 26, 0.08)",
      }}
    >
      <Box
        sx={{
          position: "relative",
          aspectRatio: "82 / 56",
          backgroundColor: "rgba(25, 56, 37, 0.06)",
        }}
      >
        {listing.image ? (
          <Box
            component="img"
            src={listing.image}
            alt={listing.title}
            loading="lazy"
            sx={{ width: "100%", height: "100%", objectFit: "cover", position: "absolute" }}
          />
        ) : (
          <Stack sx={{ height: "100%" }} alignItems="center" justifyContent="center">
            <Typography color="text.secondary">Photo coming soon</Typography>
          </Stack>
        )}
        <Stack
          direction="row"
          spacing={1}
          sx={{
            position: "absolute",
            left: 12,
            top: 12,
            right: 12,
            flexWrap: "wrap",
          }}
        >
          <Chip
            label={typeLabel}
            size="small"
            sx={{
              backgroundColor: tone,
              color: "#fff",
              fontWeight: 700,
            }}
          />
          {listing.featuredTag ? (
            <Chip
              label={listing.featuredTag}
              size="small"
              sx={{
                backgroundColor: "rgba(247, 243, 237, 0.92)",
                color: "primary.dark",
                fontWeight: 700,
              }}
            />
          ) : null}
        </Stack>
      </Box>

      <CardContent sx={{ p: 2.5 }}>
        <Stack spacing={1.25}>
          <Stack direction="row" spacing={1} alignItems="center">
            <PlaceOutlined sx={{ fontSize: 18, color: "secondary.main" }} />
            <Typography variant="body2" color="text.secondary">
              {listing.location}
            </Typography>
          </Stack>

          <Typography variant="h6" sx={{ lineHeight: 1.3 }}>
            {listing.title}
          </Typography>

          <Typography color="text.secondary" sx={{ lineHeight: 1.6 }}>
            {listing.description}
          </Typography>

          <Stack direction="row" justifyContent="space-between" spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {listing.timing}
            </Typography>
            <Typography fontWeight={800}>{listing.price}</Typography>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
