# Settings reference and implementation — 2026-10-23

## Scope and evidence

Read-only inspection of the user-supplied Xparty 9.0.45 (2345) decompiled resource tree:

`C:\Users\Admin\Pictures\New folder\Xparty_v9.0.45(2345)_src`

The REA skill was applied to the supplied artifact evidence. This focused review used the already-decompiled XML resources. It did not execute Xparty, inspect accounts, contact Xparty services, or establish runtime parity. No Xparty code, XML, images, or drawable assets were copied into XParty.

| Reference file under `res/layout` | Direct static observation | XParty adaptation |
| --- | --- | --- |
| `rearch_fragment_settings.xml` | A vertical scroll surface groups user, accounts, features, social, feedback, and help sections. | Profile action, experience categories, and additional room/notification/privacy routes. |
| `fragment_settings_user.xml` | A prominent user image, white 22sp name, edit affordance, and a secondary handle. | A prominent profile and friends entry using XParty's existing account route; no invented signed-in identity. |
| `rearch_playback_settings_sheet.xml` | A bottom-sheet drag indicator and separate overview/detail pages inside one container. | A mobile settings sheet with a category overview, a back action, detail pages, and the existing Save/Close controls. |
| `rearch_playback_settings_category_overview.xml` | White category labels, muted current values, right chevrons, horizontally padded rows, and independently hidden provider-dependent categories. | Appearance, sound, call audio, and playback rows with real current control values; unavailable categories are not fabricated. |
| `rearch_playback_settings_category_detail.xml` | A back button beside the detail title and a scrollable detail body. | Keyboard-accessible back control, focused detail heading, retained input controls, and internally scrolling sheet. |
| `rearch_features_settings.xml` | Feature title/description pairs, dividers, switch rows, language current value, and privacy navigation. | Clear setting labels, secondary descriptions, toggle tracks, real language selection, and existing privacy action. |
| `mesh_settings_audio_slider_row.xml` | Movie and voice volume icons flank a seek bar. | Existing independent movie/conversation controls with visible percentages. The web app retains two ranges to preserve its mixer behavior. |
| `mesh_settings_row_base.xml` | Title/description at one side and multiple selectable options at the other. | The existing room-capacity option group receives aligned, sufficiently large buttons. |
| `rearch_xparty_settings_fragment.xml` | A settings title above a full-height settings list. | Room settings uses the same sheet surfaces and grouped rows as personal settings. |

The violet palette, spacing, web breakpoints, 44px action targets, icons, and gradients are XParty design decisions. Native Android dimensions do not establish the exact browser appearance or behavior.

## Files and integration

- `public/xparty/settings-design.js` exports `initSettingsDesign()`.
- `public/xparty/settings-design.css` should load after the existing app styles, including experience/room styles.
- Initialize the module at the end of app setup, after the dynamic notification controls, custom selects, and profile settings section exist.
- Expose `/settings-design.js` and `/settings-design.css` through the same static aliases as the other XParty modules if serving the application from `/`.
- Initialization is idempotent for the same settings dialog.

## Behavior preserved

Original controls retain their DOM IDs, value properties, and event handlers. The module does not create another preferences store, transport, account session, or microphone/camera track. It navigates to the original account, room settings, notifications, and privacy commands. It never calls an Auth or database API.

The actual select and its existing internal menu stay together. Checkbox controls retain their existing handlers and disabled/hidden states. Save, reset, volume, notification, call-processing, capacity, theme, and room permission operations continue through the app's existing logic. The room settings entry is available only while the app displays a room; host-only elements retain their existing visibility and server authorization.

The old accordion inactivity timer cannot dismiss an active detail page; navigation is explicit through Back, Close, Save, or the native dialog dismissal. Switching categories preserves unsaved form values. Reopening the dialog still invokes the app's normal preference population.

This change does not add Xparty-only settings whose underlying capabilities do not exist in XParty. It does not apply database migrations, publish, merge, or deploy.

## Validation

Validation results will be recorded after isolated browser checks. Live accounts, provider playback, microphone permissions, and production deployment are outside this settings presentation check.
