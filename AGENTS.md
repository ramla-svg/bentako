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
