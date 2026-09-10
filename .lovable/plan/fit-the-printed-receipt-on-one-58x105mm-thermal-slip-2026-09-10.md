# Fit the printed receipt on one 58x105mm thermal slip

Right now the print sheet only sets a 58mm-wide body but never tells the printer the paper size, so the printer falls back to A4 and the slip spreads over several pages. Text sizes and spacing are also tuned for a wide page, and the store logo prints in colour.

## What changes

- Tell the printer the paper is 58mm x 105mm with a hairline margin, so one sale prints as one slip.
- Tighten line height, spacing and text sizes so a normal basket (up to about 10 items) fits the slip; longer baskets continue onto a second slip instead of leaving blank paper.
- Print everything in pure black on white, grocery-slip style: logo forced to grayscale, no coloured text, dashed separators, no background fills.
- Keep the price and grand total noticeably bigger than the rest so older eyes still read them easily.
- No change to sales data, totals, sharing, or the on-screen receipt.

## Choose a design

### #1 Sample - Classic grocery slip (compact, two-column)

```text
        [ STORE LOGO ]
       ALMAR SARI-SARI
     123 Rizal St, Brgy 5
        0917 123 4567
--------------------------------
BK-20260910-0007
09/10/26  08:41 AM
Cashier: Almar
--------------------------------
QTY ITEM              AMOUNT
 2  Kopiko 3in1        14.00
 1  Lucky Me Pancit    17.00
 3  Piattos 40g       114.00
 1  Coke Mismo         22.00
--------------------------------
Subtotal              167.00
Discount                0.00
--------------------------------
TOTAL                 167.00
Cash                  200.00
Change                 33.00
--------------------------------
      Salamat po!
   Powered by BentaKo
```

Qty sits in front of each item, one line per item. Densest option, most like a supermarket slip.

### #2 Sample - Big-total slip (name on top, amount right)

```text
        [ STORE LOGO ]

       ALMAR SARI-SARI
     123 Rizal St, Brgy 5
        0917 123 4567

Receipt : BK-20260910-0007
Date    : 09/10/26 08:41 AM
Cashier : Almar
================================
Kopiko 3in1
  2 x 7.00              14.00
Lucky Me Pancit Canton
  1 x 17.00             17.00
Piattos 40g
  3 x 38.00            114.00
================================
Subtotal               167.00
Discount                 0.00

   TOTAL      P 167.00
   (big, bold)

Cash                   200.00
Change                  33.00
================================
      Salamat po!
   Powered by BentaKo
```

Long product names never get cut, unit price is shown, and the total is a large boxed figure. Uses a bit more paper per item.

## Technical notes

- `src/lib/platform/print-service.ts`: add `@page { size: 58mm 105mm; margin: 2mm }`, set body width to the printable 54mm, add `-webkit-print-color-adjust: exact` with a grayscale filter on the logo, `color: #000`, reduce base font to ~11px/1.25 with the total at ~16px bold, and add `page-break-inside: avoid` on rows so items are not split mid-line.
- Item row markup changes to match the chosen sample; `buildReceiptPrintDoc` in `src/routes/_authenticated/pos.tsx` supplies qty/unit-price fields if sample #2 is chosen.
- Verify by rendering the print document at 58mm in a headless browser and confirming a single-page slip for a 4-item and a 10-item sale.
