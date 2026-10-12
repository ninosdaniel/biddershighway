import Autocomplete from "@mui/material/Autocomplete";
import SearchRounded from "@mui/icons-material/SearchRounded";
import TuneRounded from "@mui/icons-material/TuneRounded";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMemo, useState } from "react";
import { ListingCard } from "../components/ListingCard";
import {
  buildListingSearchIndex,
  buildSearchableOptions,
} from "../data/liveListings";
import { useListings } from "../hooks/useListings";

function normalize(value) {
  return value.toLowerCase().trim();
}

export function ListingGridSection() {
  const { listings, loading, error, retry } = useListings();
  const [searchTerms, setSearchTerms] = useState([]);
  const [searchInput, setSearchInput] = useState("");
  const [type, setType] = useState("all");
  const [region, setRegion] = useState("all");

  const regions = ["all", ...new Set(listings.map((listing) => listing.location))];
  const searchableOptions = useMemo(() => buildSearchableOptions(listings), [listings]);
  const searchTaxonomy = useMemo(
    () => ({
      year: new Set(listings.map((listing) => normalize(listing.year))),
      type: new Set(["auction", "classified"]),
    }),
    [listings],
  );

  const groupedTerms = useMemo(() => {
    const groups = {
      year: [],
      type: [],
      text: [],
    };

    searchTerms.forEach((term) => {
      const normalizedTerm = normalize(term);

      if (searchTaxonomy.year.has(normalizedTerm)) {
        groups.year.push(normalizedTerm);
      } else if (searchTaxonomy.type.has(normalizedTerm)) {
        groups.type.push(normalizedTerm);
      } else {
        groups.text.push(normalizedTerm);
      }
    });

    return groups;
  }, [searchTaxonomy, searchTerms]);

  const filteredListings = listings.filter((listing) => {
    const searchIndex = buildListingSearchIndex(listing);
    const shouldUseTypedInput = searchTerms.length === 0 && searchInput.trim() !== "";
    const matchesTypedInput =
      !shouldUseTypedInput || searchIndex.includes(searchInput.toLowerCase());
    const matchesSemanticTerms =
      (groupedTerms.year.length === 0 ||
        groupedTerms.year.includes(normalize(listing.year))) &&
      (groupedTerms.type.length === 0 ||
        groupedTerms.type.includes(normalize(listing.type))) &&
      groupedTerms.text.every((term) => searchIndex.includes(term));
    const matchesType = type === "all" || listing.type === type;
    const matchesRegion = region === "all" || listing.location === region;

    return matchesTypedInput && matchesSemanticTerms && matchesType && matchesRegion;
  });

  return (
    <Stack spacing={3.5}>
      <Paper
        elevation={0}
        sx={{
          p: 2,
          borderRadius: "15px",
          border: "1px solid rgba(25, 56, 37, 0.12)",
          backgroundColor: "rgba(255, 255, 255, 0.76)",
          backdropFilter: "blur(8px)",
        }}
      >
        <Stack spacing={2}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={2}
            alignItems={{ xs: "stretch", md: "center" }}
          >
            <Autocomplete
              multiple
              freeSolo
              autoHighlight
              options={searchableOptions}
              value={searchTerms}
              inputValue={searchInput}
              onInputChange={(_, nextValue) => setSearchInput(nextValue)}
              onChange={(_, nextValue) => {
                setSearchTerms(nextValue);
                setSearchInput("");
              }}
              filterSelectedOptions
              sx={{ flex: 1 }}
              renderTags={(value, getTagProps) =>
                value.map((option, index) => (
                  <Chip
                    {...getTagProps({ index })}
                    key={`${option}-${index}`}
                    label={option}
                    size="small"
                    sx={{ borderRadius: "8px", fontWeight: 700 }}
                  />
                ))
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder="Search by year, vehicle, location or description"
                  InputProps={{
                    ...params.InputProps,
                    startAdornment: (
                      <>
                        <SearchRounded sx={{ color: "primary.main", mr: 1 }} />
                        {params.InputProps.startAdornment}
                      </>
                    ),
                  }}
                />
              )}
            />

            <FormControl sx={{ minWidth: { xs: "100%", md: 220 } }}>
              <InputLabel id="region-select-label">Region</InputLabel>
              <Select
                labelId="region-select-label"
                value={region}
                label="Region"
                onChange={(event) => setRegion(event.target.value)}
                sx={{ borderRadius: "12px", backgroundColor: "#fff" }}
              >
                {regions.map((regionOption) => (
                  <MenuItem key={regionOption} value={regionOption}>
                    {regionOption === "all" ? "All regions" : regionOption}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>

          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={2}
            justifyContent="space-between"
            alignItems={{ xs: "stretch", md: "center" }}
          >
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: "wrap" }}>
              <TuneRounded sx={{ color: "primary.main" }} />
              {[
                { label: "All", value: "all" },
                { label: "Auctions", value: "auction" },
                { label: "Classified", value: "classified" },
              ].map((option) => (
                <Chip
                  key={option.value}
                  label={option.label}
                  clickable
                  onClick={() => setType(option.value)}
                  color={type === option.value ? "primary" : "default"}
                  variant={type === option.value ? "filled" : "outlined"}
                  sx={{
                    borderRadius: "8px",
                    fontWeight: 700,
                    backgroundColor:
                      type === option.value ? "primary.main" : "transparent",
                    color: type === option.value ? "#fff" : "primary.main",
                    borderColor: "rgba(25, 56, 37, 0.18)",
                  }}
                />
              ))}
            </Stack>

            <Chip
              label={loading ? "Loading vehicles…" : error ? "Vehicles unavailable" : `${filteredListings.length} vehicles`}
              sx={{
                alignSelf: { xs: "flex-start", md: "center" },
                backgroundColor: "rgba(25, 56, 37, 0.08)",
                color: "primary.main",
                fontWeight: 700,
              }}
            />
          </Stack>
        </Stack>
      </Paper>

      {loading ? (
        <Stack direction="row" spacing={2} alignItems="center" role="status" sx={{ py: 4 }}>
          <CircularProgress size={24} />
          <Typography>Loading vehicles…</Typography>
        </Stack>
      ) : null}

      {error ? (
        <Alert severity="error" action={<Button color="inherit" onClick={retry}>Try again</Button>}>
          {error}
        </Alert>
      ) : null}

      {!loading && !error ? (
        <Grid container spacing={3}>
          {filteredListings.map((listing) => (
            <Grid key={listing.id} size={{ xs: 12, sm: 6, lg: 4 }}>
              <ListingCard listing={listing} />
            </Grid>
          ))}
        </Grid>
      ) : null}

      {!loading && !error && filteredListings.length === 0 ? (
        <Box
          sx={{
            p: 4,
            borderRadius: "15px",
            border: "1px dashed rgba(25, 56, 37, 0.2)",
          }}
        >
          <Typography color="text.secondary">
            {listings.length === 0
              ? "No vehicles are available yet. Please check back soon."
              : "No vehicles matched this filter combination. Try another region or broaden the search."}
          </Typography>
        </Box>
      ) : null}
    </Stack>
  );
}
