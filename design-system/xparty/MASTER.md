# XParty – master design system

**Scope:** Android-first watch party (live TV, local video, synchronized playback, chat and video calling).
**Source:** UI UX Pro Max design-intelligence workflow: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
**Applied to:** `android-test/app/src/main/assets/xparty-pro-max.css`. This is a set of design decisions, not a runtime dependency.

## Direction
Premium, restrained, dark, entertainment-first. The film is the hero, not the UI.
Keep the **existing XP logo** and behavior. No unrequested animated rings, glowing borders, double speaker controls, oversized black panels or decorative text. Preserve the full set of working media, room and chat features.

## Tokens
| Role | Token | Value |
| --- | --- | --- |
| Base | `--xp-ui-bg` | `#0a0b10` |
| Panel | `--xp-ui-panel` | `rgba(20,21,29,.86)` |
| Raised element | `--xp-ui-elevated` | `rgba(33,34,45,.93)` |
| Main text | `--xp-ui-text` | `#f6f5fb` |
| Secondary text | `--xp-ui-muted` | `#b8b8c9` |
| Accent | `--xp-ui-accent` | `#a68dff` |
| Border | `--xp-ui-line` | `rgba(234,235,255,.11)` |

- Type: system sans (Inter if already installed, then Roboto / Noto Sans / system), main copy 16px, line-height ~1.4–1.5. No remote font dependency.
- Spacing: 4 / 8 / 12 / 16 / 24 px; compact room controls, 44px minimum primary touch targets.
- Radius: 10–14px controls, 20px lobby card. Avoid nested thick borders.
- Motion: touch response ~95–110ms; respect reduced-motion, never animate video width while keyboard opens.
- Accessibility: text 4.5:1 contrast target; use focus-visible outline for keyboard users. Icon buttons retain labels from existing markup.

## Screen rules
### Lobby
Preserve existing sign-in / guest path. Join and create actions are clear, input at least 44px high, no large empty decorative containers.

### Playback
Keep video aspect and native decoder unchanged. Progress bar remains reachable **when controls are shown**. Do not override the user's auto-hide choice; don't show duplicate ping or leave-cross controls.

### Chat
Messages scroll inside the message list while composer stays usable with Android keyboard. Do not attach any input-keyboard listeners in the design skin. Preserve send, reactions, mic and attachments.

### People
Use a 40%-width temporary side drawer in room mode; do not force full-screen overlays. Keep button labels and accessible contrast.

### Settings/sources
Use a consistent surface and one selected-state accent. Avoid double icons or introducing animations solely to decorate the screen.

## Verification
1. Create/join room from Android; background and login remain stable.
2. Start YouTube/IPTV/local playback, scrub, pause, rotate, enter full screen, exit full screen.
3. Open keyboard repeatedly, type in chat, switch recent apps; video must not resize or stop.
4. Test microphone and camera permissions, chat reactions, attachments and participant drawer.
5. Verify controls auto-hide, seek returns upon touch, colors remain readable.
6. Check TalkBack, hardware keyboard, dark mode and reduced-motion.
7. Test on actual Android device before distributing as stable. Build success alone does not prove these behaviors.

## Skill updates
The canonical skill is installed via the **official CLI** by `scripts/install-ui-ux-pro-max.sh`.
That installation is a development-time tool, not an APK feature. Keep generated skill files out of the APK; only tested UI changes belong in the Android assets.
