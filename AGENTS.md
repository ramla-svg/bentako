<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep public landing presentation isolated in its own component and scoped CSS; the POS theme and business workflows must remain unchanged.
- Decide root navigation only from resolved AppSessionProvider status and the central platform service; cached sessions must retain offline dashboard entry and installed signed-out clients keep login entry.
- Validate direct auth mode in route search parameters; landing CTAs must use typed links rather than changing signup behavior.

- Mount only one shared POS review tree: persistent at desktop width and inside the mobile sheet below it, with cart/payment state owned by the POS page so resizing cannot duplicate inputs or checkout handlers.
- Keep desktop-only layout changes behind the 1024px breakpoint to preserve installed mobile workflows.
- Reuse the shared InstallButton for landing and signed-in sidebar entry points; only install-service and the global InstallPrompt own prompting and guidance to avoid duplicate listeners or dialogs.

- Keep available plan descriptions in the shared plan module, separate from retained-history entitlements, so copy cannot promise unimplemented screens.
- Pass the cached store plan through StoreContext; local product creation/restoration and wallet photo writes enforce limits at the mutation boundary, with Free as the safe default.
- POS thumbnails read the store-scoped device-only product photo table and release temporary object URLs on replacement/unmount; product rows and checkout remain independent of display handles.
