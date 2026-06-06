---
name: frontend
description: Frontend coding standards for React + Vite + Material UI (MUI v5) — components, theming, forms, data display
---

**Trigger:** Always applied when writing or reviewing frontend code in `apps/web/`.

> **Also apply:** `code-quality` (ISO-level standards for all code) and `frontend-testing` (Vitest, 80% coverage). Every component, hook, and utility written here requires a co-located test file written in the same session.

## Component rules

- React functional components only — no class components
- One component per file; filename matches the exported component name (PascalCase)
- Prefer MUI components over raw HTML elements for all UI

## Material UI (MUI v5) usage

**Install:**
```bash
npm install @mui/material @mui/icons-material @emotion/react @emotion/styled
```

**Theme — create once, wrap at app root:**
```tsx
import { createTheme, ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

const theme = createTheme({
  palette: {
    primary:   { main: '#1565C0' },   // finance-blue
    secondary: { main: '#2E7D32' },   // money-green
    error:     { main: '#C62828' },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", sans-serif',
  },
});

// In main.tsx / App.tsx
<ThemeProvider theme={theme}>
  <CssBaseline />
  {/* app routes */}
</ThemeProvider>
```

**Component mapping (prefer these over raw HTML):**

| Use case | MUI component |
|---|---|
| Page layout | `Box`, `Container`, `Stack`, `Grid2` |
| Cards / panels | `Card`, `CardContent`, `CardHeader` |
| Text | `Typography` (variant: `h1`–`h6`, `body1`, `body2`, `caption`) |
| Buttons | `Button`, `IconButton`, `LoadingButton` (from `@mui/lab`) |
| Text input | `TextField` (always with `label` + `helperText` for errors) |
| Select / dropdown | `Select` inside `FormControl` |
| Tables | `Table`, `TableHead`, `TableBody`, `TableRow`, `TableCell` |
| Data grid | `DataGrid` from `@mui/x-data-grid` for sortable/paginated lists |
| Alerts / banners | `Alert` (severity: `error` / `warning` / `info` / `success`) |
| Snackbar toasts | `Snackbar` + `Alert` |
| Loading state | `CircularProgress`, `Skeleton` |
| Dialogs | `Dialog`, `DialogTitle`, `DialogContent`, `DialogActions` |
| Navigation | `AppBar`, `Toolbar`, `Drawer`, `BottomNavigation` |
| Chips / tags | `Chip` |
| Dividers | `Divider` |
| Icons | `@mui/icons-material` — always import named: `import InfoIcon from '@mui/icons-material/Info'` |

**Styling — use `sx` prop for one-off overrides; avoid inline `style`:**
```tsx
<Box sx={{ p: 2, borderRadius: 2, bgcolor: 'background.paper' }}>
  <Typography variant="h6" sx={{ color: 'primary.main' }}>
    Financial Summary
  </Typography>
</Box>
```

For repeated styles, use `styled()` or `sx` in a shared component — never duplicate `sx` objects across files.

## Forms

Use React Hook Form + MUI:
```tsx
import { useForm, Controller } from 'react-hook-form';
import { TextField, Button } from '@mui/material';

const { control, handleSubmit } = useForm<FormData>();

<Controller
  name="pan"
  control={control}
  rules={{ pattern: /^[A-Z]{5}[0-9]{4}[A-Z]$/ }}
  render={({ field, fieldState }) => (
    <TextField
      {...field}
      label="PAN"
      error={!!fieldState.error}
      helperText={fieldState.error?.message ?? 'e.g. ABCDE1234F'}
      inputProps={{ maxLength: 10, style: { textTransform: 'uppercase' } }}
    />
  )}
/>
```

## Indian number formatting

Always use `en-IN` locale for currency and numbers — never hardcode commas:
```tsx
const formatINR = (amount: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
// → ₹5,00,000.00

// In JSX — pair with MUI Typography:
<Typography variant="h5" fontWeight={600}>
  {formatINR(card.creditLimit)}
</Typography>
```

## Data display patterns

**Financial summary card:**
```tsx
<Card variant="outlined" sx={{ borderRadius: 3 }}>
  <CardContent>
    <Typography variant="caption" color="text.secondary">Total Credit Limit</Typography>
    <Typography variant="h5" fontWeight={700}>{formatINR(total)}</Typography>
  </CardContent>
</Card>
```

**Empty / loading states:**
```tsx
// Loading
<Stack spacing={1}>
  <Skeleton variant="rectangular" height={80} sx={{ borderRadius: 2 }} />
  <Skeleton variant="text" width="60%" />
</Stack>

// Empty
<Alert severity="info">No credit cards linked to this PAN yet.</Alert>
```

**Error states:**
```tsx
<Alert severity="error" sx={{ mt: 2 }}>
  {error.message}
</Alert>
```

## Routing

Use React Router v6 (`createBrowserRouter`). Protected routes check JWT and redirect to `/login` if missing.

## General

- Never use inline `style={{}}` when `sx` covers it
- Avoid MUI v4 patterns (`makeStyles`, `withStyles`) — use `sx` or `styled()`
- `color` props on MUI components accept theme tokens: `"primary"`, `"error"`, `"text.secondary"` — no raw hex in JSX
- Financial amounts formatted in `en-IN` locale: `₹5,00,000`
