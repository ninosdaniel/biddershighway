import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import LanguageRounded from "@mui/icons-material/LanguageRounded";
import MenuRounded from "@mui/icons-material/MenuRounded";
import PersonOutlineRounded from "@mui/icons-material/PersonOutlineRounded";
import PublicRounded from "@mui/icons-material/PublicRounded";
import { useState } from "react";
import {
  AppBar,
  Box,
  Button,
  Container,
  Divider,
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";

const menuButtonSx = {
  fontWeight: 700,
  fontSize: "0.75rem",
};

const languages = [
  { code: "EN", label: "English" },
  { code: "SV", label: "Svenska" },
];

export function MainHeader() {
  const [auctionsAnchorEl, setAuctionsAnchorEl] = useState(null);
  const [languageAnchorEl, setLanguageAnchorEl] = useState(null);
  const [mobileMenuAnchorEl, setMobileMenuAnchorEl] = useState(null);
  const [selectedLanguageCode, setSelectedLanguageCode] = useState("EN");

  // These pages are served by the existing website, outside this homepage app.
  const websiteUrl = `https://www.biddershighway.com/${selectedLanguageCode.toLowerCase()}`;
  const pageLinks = {
    faq: `${websiteUrl}/questions`,
    articles: `${websiteUrl}/posts`,
    sell: `${websiteUrl}/sales_inquiries/new`,
  };

  const auctionsMenuOpen = Boolean(auctionsAnchorEl);
  const languageMenuOpen = Boolean(languageAnchorEl);
  const mobileMenuOpen = Boolean(mobileMenuAnchorEl);

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        backgroundColor: "rgba(25, 56, 37, 0.92)",
        color: "#fff",
        borderBottom: "1px solid rgba(255, 255, 255, 0.14)",
        backdropFilter: "blur(8px)",
      }}
    >
      <Container maxWidth="lg">
        <Toolbar
          disableGutters
          sx={{
            minHeight: 78,
            display: "grid",
            gridTemplateColumns: { xs: "1fr auto", md: "180px 1fr auto" },
            gap: 2,
            alignItems: "center",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <Typography
              component="img"
              src="/logo.svg"
              alt="Bidders Highway logo"
              sx={{
                width: 148,
                maxWidth: "100%",
                height: "auto",
              }}
            />
          </Box>

          <Stack
            direction="row"
            spacing={1}
            justifyContent="center"
            sx={{ display: { xs: "none", md: "flex" } }}
          >
            <Button
              color="inherit"
              endIcon={<ExpandMoreRounded />}
              sx={menuButtonSx}
              onClick={(event) => setAuctionsAnchorEl(event.currentTarget)}
            >
              Auctions
            </Button>
            <Button component="a" href={pageLinks.faq} color="inherit" sx={menuButtonSx}>
              FAQ
            </Button>
            <Button component="a" href={pageLinks.articles} color="inherit" sx={menuButtonSx}>
              Articles
            </Button>
            <Button
              component="a"
              href={pageLinks.sell}
              variant="contained"
              color="secondary"
              sx={{
                ...menuButtonSx,
                color: "#fff",
                boxShadow: "none",
                "&:hover": {
                  boxShadow: "none",
                },
              }}
            >
              Sell with us
            </Button>
          </Stack>

          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            justifyContent="flex-end"
            sx={{ display: { xs: "none", md: "flex" }, flexWrap: "wrap" }}
          >
            <Button
              color="inherit"
              startIcon={<PublicRounded />}
              endIcon={<ExpandMoreRounded />}
              sx={menuButtonSx}
              onClick={(event) => setLanguageAnchorEl(event.currentTarget)}
            >
              {selectedLanguageCode}
            </Button>
            <Button color="inherit" startIcon={<PersonOutlineRounded />} sx={menuButtonSx}>
              LOGIN
            </Button>
            <Button
              variant="contained"
              sx={{
                ...menuButtonSx,
                backgroundColor: "#fff",
                color: "primary.main",
                boxShadow: "none",
                "&:hover": {
                  backgroundColor: "rgba(255, 255, 255, 0.9)",
                  boxShadow: "none",
                },
              }}
            >
              Create Account
            </Button>
          </Stack>

          <Box sx={{ display: { xs: "flex", md: "none" }, justifyContent: "flex-end" }}>
            <IconButton
              color="inherit"
              aria-label="Open navigation menu"
              onClick={(event) => setMobileMenuAnchorEl(event.currentTarget)}
            >
              <MenuRounded />
            </IconButton>
          </Box>

          <Menu
            anchorEl={auctionsAnchorEl}
            open={auctionsMenuOpen}
            onClose={() => setAuctionsAnchorEl(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
            transformOrigin={{ vertical: "top", horizontal: "left" }}
          >
            <MenuItem onClick={() => setAuctionsAnchorEl(null)}>Live Auctions</MenuItem>
            <MenuItem onClick={() => setAuctionsAnchorEl(null)}>Coming Soon</MenuItem>
            <MenuItem onClick={() => setAuctionsAnchorEl(null)}>Sold Vehicles</MenuItem>
          </Menu>

          <Menu
            anchorEl={languageAnchorEl}
            open={languageMenuOpen}
            onClose={() => setLanguageAnchorEl(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
            transformOrigin={{ vertical: "top", horizontal: "left" }}
          >
            {languages.map((language) => (
              <MenuItem
                key={language.code}
                selected={selectedLanguageCode === language.code}
                onClick={() => {
                  setSelectedLanguageCode(language.code);
                  setLanguageAnchorEl(null);
                }}
              >
                {language.label}
              </MenuItem>
            ))}
          </Menu>

          <Menu
            anchorEl={mobileMenuAnchorEl}
            open={mobileMenuOpen}
            onClose={() => setMobileMenuAnchorEl(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "right" }}
          >
            <MenuItem
              onClick={(event) => {
                setMobileMenuAnchorEl(null);
                setAuctionsAnchorEl(event.currentTarget);
              }}
            >
              Auctions
            </MenuItem>
            <MenuItem component="a" href={pageLinks.faq} onClick={() => setMobileMenuAnchorEl(null)}>
              FAQ
            </MenuItem>
            <MenuItem component="a" href={pageLinks.articles} onClick={() => setMobileMenuAnchorEl(null)}>
              Articles
            </MenuItem>
            <MenuItem component="a" href={pageLinks.sell} onClick={() => setMobileMenuAnchorEl(null)}>
              Sell with us
            </MenuItem>
            <Divider />
            <MenuItem
              onClick={(event) => {
                setMobileMenuAnchorEl(null);
                setLanguageAnchorEl(event.currentTarget);
              }}
            >
              <ListItemIcon>
                <LanguageRounded fontSize="small" />
              </ListItemIcon>
              {selectedLanguageCode}
            </MenuItem>
            <MenuItem onClick={() => setMobileMenuAnchorEl(null)}>
              <ListItemIcon>
                <PersonOutlineRounded fontSize="small" />
              </ListItemIcon>
              LOGIN
            </MenuItem>
            <MenuItem onClick={() => setMobileMenuAnchorEl(null)}>Create Account</MenuItem>
          </Menu>
        </Toolbar>
      </Container>
    </AppBar>
  );
}
