# Design System

## Color Palette

### Primary Colors

- **Primary**: `#3B82F6` (Blue)
- **Primary Dark**: `#2563EB`
- **Primary Light**: `#60A5FA`

### Neutral Colors

- **Gray 50**: `#F9FAFB`
- **Gray 100**: `#F3F4F6`
- **Gray 200**: `#E5E7EB`
- **Gray 500**: `#6B7280`
- **Gray 900**: `#111827`

### Semantic Colors

- **Success**: `#10B981` (Green)
- **Warning**: `#F59E0B` (Amber)
- **Error**: `#EF4444` (Red)
- **Info**: `#3B82F6` (Blue)

## Typography

### Font Family

- **Primary**: Inter, system-ui, sans-serif
- **Monospace**: 'Fira Code', monospace

### Font Sizes

- **xs**: 0.75rem (12px)
- **sm**: 0.875rem (14px)
- **base**: 1rem (16px)
- **lg**: 1.125rem (18px)
- **xl**: 1.25rem (20px)
- **2xl**: 1.5rem (24px)
- **3xl**: 1.875rem (30px)

### Font Weights

- **Normal**: 400
- **Medium**: 500
- **Semibold**: 600
- **Bold**: 700

## Spacing

Base unit: 4px (0.25rem)

- **1**: 0.25rem (4px)
- **2**: 0.5rem (8px)
- **3**: 0.75rem (12px)
- **4**: 1rem (16px)
- **6**: 1.5rem (24px)
- **8**: 2rem (32px)
- **12**: 3rem (48px)

## Border Radius

- **sm**: 0.25rem (4px)
- **md**: 0.375rem (6px)
- **lg**: 0.5rem (8px)
- **xl**: 0.75rem (12px)
- **full**: 9999px

## Shadows

### Box Shadows

```css
/* sm */
box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);

/* md */
box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);

/* lg */
box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);

/* xl */
box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1);
```

## Components

### Buttons

**Variants:**

1. **Primary**
   - Background: Primary color
   - Text: White
   - Hover: Primary Dark

2. **Secondary**
   - Background: Gray 100
   - Text: Gray 900
   - Hover: Gray 200

3. **Danger**
   - Background: Error color
   - Text: White
   - Hover: Darker error

**Sizes:**
- **sm**: 32px height, 12px padding
- **md**: 40px height, 16px padding
- **lg**: 48px height, 24px padding

### Input Fields

**States:**
- Default: Gray 200 border
- Focus: Primary border, ring
- Error: Error border, ring
- Disabled: Gray 100 background

**Height:** 40px (md size)

### Cards

```css
.card {
  background: white;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1);
  padding: 1.5rem;
}
```

## Icons

**Library**: Lucide React

**Sizes:**
- **sm**: 16px
- **md**: 20px
- **lg**: 24px
- **xl**: 32px

## Animations

### Transitions

```css
.transition-base {
  transition: all 150ms ease-in-out;
}

.transition-slow {
  transition: all 300ms ease-in-out;
}
```

### Loading Spinner

- Duration: 1s
- Easing: linear
- Color: Primary

## Breakpoints

- **sm**: 640px
- **md**: 768px
- **lg**: 1024px
- **xl**: 1280px
- **2xl**: 1536px

## Accessibility

- Minimum contrast ratio: 4.5:1 for normal text
- Minimum touch target: 44x44px
- Focus visible on all interactive elements
- ARIA labels for icon-only buttons
