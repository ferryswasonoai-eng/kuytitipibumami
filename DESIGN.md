---
name: Luminous Essence
colors:
  surface: '#fbf9f8'
  surface-dim: '#dbd9d9'
  surface-bright: '#fbf9f8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3f3'
  surface-container: '#efeded'
  surface-container-high: '#eae8e7'
  surface-container-highest: '#e4e2e2'
  on-surface: '#1b1c1c'
  on-surface-variant: '#4c4452'
  inverse-surface: '#303030'
  inverse-on-surface: '#f2f0f0'
  outline: '#7e7383'
  outline-variant: '#cfc2d4'
  surface-tint: '#7f3cba'
  primary: '#7c39b7'
  on-primary: '#ffffff'
  primary-container: '#9654d2'
  on-primary-container: '#fffbff'
  inverse-primary: '#deb7ff'
  secondary: '#a92a6f'
  on-secondary: '#ffffff'
  secondary-container: '#fd6eb4'
  on-secondary-container: '#700045'
  tertiary: '#5a5c5d'
  on-tertiary: '#ffffff'
  tertiary-container: '#737576'
  on-tertiary-container: '#fcfdfe'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#f1dbff'
  primary-fixed-dim: '#deb7ff'
  on-primary-fixed: '#2d0050'
  on-primary-fixed-variant: '#651ea0'
  secondary-fixed: '#ffd8e6'
  secondary-fixed-dim: '#ffb0d0'
  on-secondary-fixed: '#3d0024'
  on-secondary-fixed-variant: '#8a0957'
  tertiary-fixed: '#e1e3e4'
  tertiary-fixed-dim: '#c5c7c8'
  on-tertiary-fixed: '#191c1d'
  on-tertiary-fixed-variant: '#454748'
  background: '#fbf9f8'
  on-background: '#1b1c1c'
  surface-variant: '#e4e2e2'
typography:
  display-lg:
    fontFamily: Manrope
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Manrope
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Manrope
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-caps:
    fontFamily: Manrope
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  container-max: 1280px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 40px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
---

## Brand & Style

The brand identity centers on clinical purity and modern luxury. It targets a discerning audience that values transparency, efficacy, and a meditative shopping experience. The interface acts as a high-end digital "clean room," where products are heroed through clarity and light.

The design style is **Minimalist Glassmorphism**. By combining vast white space with semi-transparent layers, the UI evokes the qualities of high-quality glass packaging and clean hydration. The aesthetic prioritizes light refraction and depth over solid blocks of color, ensuring the product photography remains the focal point.

## Colors

The palette is anchored in a pristine white environment to emphasize cleanliness. 
- **Primary (Amethyst Purple):** Used for primary calls to action, active states, and brand-defining accents.
- **Secondary (Orchid Pink):** Reserved for highlights, promotional badges, and hover states to inject energy.
- **Surface & Backgrounds:** A range of soft whites and ultra-light greys (`#F8F9FA` to `#FFFFFF`) are used to create the layered glass effect.
- **Neutrals:** Deep greys are used for text to maintain high readability without the harshness of pure black.

## Typography

The typography uses **Manrope** exclusively to maintain a modern, systematic, and balanced feel. Its geometric nature complements the glass surfaces perfectly.

- **Headlines:** Use tight letter-spacing and bold weights to create a sense of authority and premium quality.
- **Body:** Generous line-heights are employed to ensure the catalog feels airy and easy to scan.
- **Labels:** Use uppercase styling for product categories and small metadata to distinguish them from editorial copy.

## Layout & Spacing

This design system utilizes a **fluid grid** with strict horizontal margins to maintain the minimalist "breathability." 

- **Desktop:** A 12-column grid with a 1280px max-width. Product grids should utilize 3 or 4 columns to give each item significant visual real estate.
- **Mobile:** A 2-column grid for product listings to allow users to compare items quickly while maintaining large enough tap targets.
- **Spacing Rhythm:** Use a 4px/8px base unit. Larger "Stack" increments (32px+) are preferred between sections to reinforce the minimalist aesthetic.

## Elevation & Depth

Depth is achieved through **Glassmorphism** rather than traditional elevation.
- **Backdrop Blur:** All elevated surfaces (cards, modals, navigation bars) must use a `20px` to `40px` backdrop-filter blur.
- **Transparency:** Background colors for glass elements should be white at 60%–80% opacity.
- **Borders:** Use ultra-thin (`0.5px` to `1px`) solid white borders at 40% opacity to simulate the edge of a glass pane.
- **Shadows:** Use "Ambient Shadows"—extremely soft, large-radius blurs with very low opacity (e.g., `box-shadow: 0 20px 40px rgba(0,0,0,0.04)`). Avoid dark or heavy shadows.

## Shapes

The shape language is refined and approachable.
- **Core Elements:** Cards and containers use a `0.5rem` (8px) radius to maintain a professional, structured look.
- **Interactive Elements:** Buttons and input fields use slightly more pronounced rounding (`rounded-lg`) to differentiate them from static content containers.
- **Icons:** Use thin-stroke (1.5pt) linear icons to match the "ultra-thin" border aesthetic.

## Components

- **Glassmorphic Cards:** The primary vessel for products. They should feature a subtle gradient overlay to ensure text remains legible over product images.
- **Buttons:**
    - *Primary:* Solid purple to pink gradient with white text. 
    - *Secondary:* Transparent background with a "glass" border and primary color text.
- **Product Grids:** Optimized for mobile with "sticky" filter chips at the top of the viewport.
- **Input Fields:** Minimalist design with only a bottom border that transitions to a full "glass" container on focus.
- **Chips:** Small, pill-shaped tags used for "New," "Vegan," or "Organic" badges, using low-saturation versions of the accent colors.
- **Navigation:** A fixed top bar with a heavy backdrop blur (`40px`) to create a seamless transition as the user scrolls through the catalog.