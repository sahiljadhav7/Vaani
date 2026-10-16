import { createTheme } from '@mui/material/styles'

// Dark only; tokens from Docs/UI.md.
export const theme = createTheme({
  palette: {
    mode: 'dark',
    background: { default: '#0c0d10', paper: '#14161b' },
    divider: '#262a32',
    text: { primary: '#ecebe7', secondary: '#8a8f99', disabled: '#5b606a' },
    error: { main: '#e5484d' },
    success: { main: '#46c37b' },
    agent: { main: '#3fb8a9' },
    customer: { main: '#e8a33d' },
  },
  shape: { borderRadius: 12 },
  typography: { h3: { fontWeight: 300 } },
})
