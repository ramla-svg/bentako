# Compact BentaKo dashboard

## Goal
Make the mobile home screen feel about 90% of its current size and show the Sales Today summary, all four glance figures, and all eight quick actions within one typical phone screen.

## Changes
- Tighten the branded header and greeting area while keeping the logo, tagline, alert bell, account initials, role, and sync status.
- Reduce the height of the green Sales Today card by shortening its graph, tightening spacing, and using smaller summary cells and New Sale button without making amounts hard to read.
- Replace the sideways-scrolling glance cards with a compact four-column row for Expenses, Low Stock, GCash, and Utang.
- Replace the large two-column quick-action tiles with an icon-first four-column by two-row grid, preserving all eight current destinations and pastel colors.
- Reduce section gaps and outer spacing on phones; keep the existing comfortable layout on tablets and desktop where space is available.
- Keep Recent Transactions and restocking details below the first screen and fully scrollable.
- Preserve the fixed bottom navigation, real store data, offline behavior, and all existing actions.

## Quality checks
- Verify the complete priority area at 390×844 and confirm it remains readable at 320, 390, 430, 768, and 1024 px widths.
- Confirm there is no sideways page movement, all controls remain easy to tap, vertical scrolling still works, and navigation links still open correctly.
- Run the project checks after the presentation changes.

## Technical scope
Presentation-only updates to the dashboard and its home-screen header spacing; no database, syncing, authentication, or business-rule changes.
