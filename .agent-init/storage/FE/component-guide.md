# Frontend Component Guide

## Overview

This guide outlines our component structure, naming conventions, and best practices.

## Directory Structure

```
src/
├── components/
│   ├── common/          # Reusable components
│   ├── features/        # Feature-specific components
│   └── layouts/         # Layout components
├── hooks/               # Custom React hooks
├── utils/               # Utility functions
└── types/               # TypeScript types
```

## Component Naming Conventions

- **PascalCase** for component names
- **camelCase** for prop names
- **UPPER_SNAKE_CASE** for constants

## Common Components

### Button

Standard button component with variants.

**Usage:**
```tsx
import { Button } from '@/components/common/Button'

<Button variant="primary" size="md" onClick={handleClick}>
  Click Me
</Button>
```

**Props:**
- `variant`: 'primary' | 'secondary' | 'danger'
- `size`: 'sm' | 'md' | 'lg'
- `disabled`: boolean
- `loading`: boolean

### Input

Form input component with validation.

**Usage:**
```tsx
import { Input } from '@/components/common/Input'

<Input
  type="email"
  label="Email Address"
  placeholder="user@example.com"
  error={errors.email}
  {...register('email')}
/>
```

### Modal

Accessible modal dialog component.

**Usage:**
```tsx
import { Modal } from '@/components/common/Modal'

<Modal isOpen={isOpen} onClose={handleClose} title="Confirm Action">
  <p>Are you sure you want to proceed?</p>
  <Button onClick={handleConfirm}>Confirm</Button>
</Modal>
```

## Custom Hooks

### useAuth

Authentication state and methods.

**Usage:**
```tsx
import { useAuth } from '@/hooks/useAuth'

const { user, login, logout, isAuthenticated } = useAuth()
```

### useApi

API request wrapper with loading/error states.

**Usage:**
```tsx
import { useApi } from '@/hooks/useApi'

const { data, loading, error, refetch } = useApi('/api/users')
```

## Styling

We use **Tailwind CSS** for styling.

**Best Practices:**
- Use Tailwind utility classes
- Extract repeated patterns into components
- Use `@apply` sparingly in CSS modules

**Example:**
```tsx
<div className="flex items-center gap-4 rounded-lg bg-gray-100 p-4">
  <Avatar src={user.avatar} />
  <span className="text-lg font-semibold">{user.name}</span>
</div>
```

## State Management

We use **Zustand** for global state.

**Store Structure:**
```tsx
interface AppStore {
  user: User | null
  setUser: (user: User) => void
  documents: Document[]
  addDocument: (doc: Document) => void
}
```

## Testing

Use **Vitest** and **Testing Library**.

**Example:**
```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { Button } from './Button'

test('calls onClick when clicked', () => {
  const handleClick = vi.fn()
  render(<Button onClick={handleClick}>Click</Button>)

  fireEvent.click(screen.getByText('Click'))
  expect(handleClick).toHaveBeenCalledOnce()
})
```

## Accessibility

- Always include ARIA labels
- Ensure keyboard navigation works
- Test with screen readers
- Maintain proper heading hierarchy
