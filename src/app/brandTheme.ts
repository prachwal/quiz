import { theme } from 'antd'
import type { ThemeConfig } from 'antd'

const FONT_FAMILY =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI Variable Text', 'Segoe UI', Inter, Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji'"

const BRAND = '#4f46e5'
const BRAND_DARK = '#7c74f0'

/**
 * App-wide antd theme: indigo brand, 16px body text, softer surfaces; shared by the app and the public shell.
 * `touch` (coarse pointer) raises control heights so buttons, inputs, selects and pagination are >= 44px.
 */
export function brandTheme(dark: boolean, compact = false, touch = false): ThemeConfig {
  const algorithm = [dark ? theme.darkAlgorithm : theme.defaultAlgorithm]
  if (compact) algorithm.push(theme.compactAlgorithm)

  return {
    algorithm,
    token: {
      colorPrimary: dark ? BRAND_DARK : BRAND,
      colorInfo: dark ? BRAND_DARK : BRAND,
      colorSuccess: dark ? '#3fb871' : '#16a34a',
      colorWarning: dark ? '#e0a33a' : '#d97706',
      colorError: dark ? '#f0616d' : '#dc2626',
      colorBgLayout: dark ? '#0c0d14' : '#f5f6fb',
      colorBgContainer: dark ? '#161722' : '#ffffff',
      colorBgElevated: dark ? '#1d1e2b' : '#ffffff',
      colorBorderSecondary: dark ? '#262838' : '#eceef5',
      colorBorder: dark ? '#34364a' : '#dcdfea',
      fontFamily: FONT_FAMILY,
      fontSize: 16,
      lineHeight: 1.6,
      fontSizeHeading1: 34,
      fontSizeHeading2: 27,
      fontSizeHeading3: 22,
      fontSizeHeading4: 19,
      fontSizeHeading5: 17,
      borderRadius: 10,
      borderRadiusLG: 16,
      borderRadiusSM: 6,
      controlHeight: touch ? 44 : 38,
      controlHeightLG: touch ? 50 : 46,
      controlHeightSM: touch ? 32 : 28,
      motionDurationMid: '0.2s',
    },
    components: {
      Layout: {
        headerBg: 'transparent',
        headerPadding: 0,
        headerHeight: 64,
        footerBg: 'transparent',
      },
      Card: {
        headerFontSize: 18,
        headerHeight: 60,
      },
      Button: {
        fontWeight: 500,
        primaryShadow: 'none',
        defaultShadow: 'none',
      },
      Typography: {
        titleMarginBottom: '0.4em',
        titleMarginTop: '1em',
      },
      Tag: {
        defaultBg: dark ? '#22243a' : '#f1f2f8',
      },
      Table: {
        headerBg: dark ? '#1b1c29' : '#f7f8fc',
        headerColor: dark ? 'rgba(255,255,255,0.75)' : 'rgba(17,24,39,0.72)',
      },
      Segmented: {
        itemSelectedBg: dark ? '#2b2d44' : '#ffffff',
      },
    },
  }
}
