# Fix the phone-limit popup layout

## What will change

- Keep the popup inside the visible screen with comfortable side and top/bottom spacing on small phones.
- Make long headings, explanations, device names, and action labels wrap instead of clipping.
- Limit the device list height so the popup can scroll internally when necessary, keeping all actions reachable.
- Use a wider, balanced desktop layout with the device list beside the actions, while preserving a simple stacked layout on phones.
- Keep the current release-device, upgrade, close, and “Not now” behavior unchanged.

## Technical details

- Update only the phone-limit popup in `src/components/device-gate.tsx`.
- Apply responsive width, maximum-height, overflow, typography, and grid classes using the existing design system.
- Verify the result at phone and desktop sizes, including long device names and all visible actions.
