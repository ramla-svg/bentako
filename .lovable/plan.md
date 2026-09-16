# Stock value card on the Products screen

Add a small summary card at the top of the Products screen showing what your stock is worth.

## What it shows

Three figures, based on all active products and their current stock on hand:

- Capital — what the stock cost you (cost price x quantity)
- Retail — what it would bring in if you sold everything (selling price x quantity)
- Income — the difference (retail minus capital), plus the margin as a percent

Layout, mobile-first:

```text
Stock value                            126 items
+-------------------+-------------------+
| Capital  P8,450.00| Retail  P11,300.00|
+-------------------+-------------------+
| Income if all sold        P2,850.00   |
|                              +33.7%   |
+---------------------------------------+
```

## Behaviour

- Counts only active products with stock above zero; archived products are left out.
- When the archived switch is on, the card stays about active stock and says so.
- Updates instantly as products, prices, or stock change.
- Shown to everyone (owner and cashier), free and Pro alike.
- Nothing is stored or synced — the figures are calculated on the phone from products already there.

## Technical notes

Presentation-only change in `src/routes/_authenticated/products.tsx`: a `useMemo` over the existing `products` live query summing `cost_price * stock_quantity` and `selling_price * stock_quantity`, rendered as a new card above the search field using `formatMoney` / `formatQty` and existing tile tokens. No database, sync, or plan-gating changes.
