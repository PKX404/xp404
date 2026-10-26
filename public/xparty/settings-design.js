import {icon} from './icons.js';
import {t} from './settings.js';

const instances = new WeakMap();

// Present the existing settings controls as overview and detail pages.
// All values, save actions, authentication and host checks stay with their existing handlers.
export function initSettingsDesign() {
  const $ = id => document.getElementById(id);
  const dialog = $('settings-dialog');
  if (!dialog) return {refresh() {}};
  if (instances.has(dialog)) return instances.get(dialog);
  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  };
  const setText = (element, text) => { if (element.textContent !== text) element.textContent = text; };
  const labels = [];
  const label = (element, key) => {
    element.dataset.localizeDynamic = '';
    labels.push({element, key});
    setText(element, t(key));
    return element;
  };
  const heading = dialog.querySelector('.dialog-heading');
  const title = heading.querySelector('h2');
  title.dataset.localizeDynamic = '';
  if (!title.id) title.id = 'settings-page-title';
  title.tabIndex = -1;
  dialog.setAttribute('aria-labelledby', title.id);
  dialog.classList.add('settings-redesign');
  const back = node('button', 'settings-back');
  back.type = 'button';
  back.setAttribute('aria-label', 'Back to all settings');
  icon(back, 'return-video', 'Back to all settings');
  // Use a simple original back chevron, independent of the shared player icon.
  back.style.removeProperty('--control-icon');
  back.classList.remove('icon-control');
  back.textContent = '‹';
  back.hidden = true;
  heading.prepend(back);

  const overview = node('div', 'settings-overview');
  const intro = node('p', 'settings-intro', 'YOUR XPARTY');
  const accountGroup = node('div', 'settings-account-group');
  const preferenceLabel = node('p', 'settings-group-label', 'YOUR EXPERIENCE');
  const preferenceGroup = node('div', 'settings-category-group');
  const moreLabel = node('p', 'settings-group-label', 'MORE');
  const moreGroup = node('div', 'settings-category-group settings-more-group');
  overview.append(intro, accountGroup, preferenceLabel, preferenceGroup, moreLabel, moreGroup);
  heading.after(overview);
  let active = null;
  let lastRow = null;
  const pages = [];

  function row(container, {name, description, shape, handler, className = ''}) {
    const button = node('button', 'settings-overview-row ' + className);
    button.type = 'button';
    const mark = node('span', 'settings-row-icon');
    icon(mark, shape, '');
    mark.setAttribute('aria-hidden', 'true');
    const text = node('span', 'settings-row-copy');
    const nameNode = label(node('strong'), name);
    const descriptionNode = node('span', 'settings-row-description', description);
    text.append(nameNode, descriptionNode);
    const value = node('span', 'settings-row-value');
    value.setAttribute('aria-hidden', 'true');
    const arrow = node('span', 'settings-row-chevron', '›');
    arrow.setAttribute('aria-hidden', 'true');
    button.append(mark, text, value, arrow);
    button.addEventListener('click', handler);
    container.append(button);
    return {button, value};
  }
  function selectLabel(id) {
    const select = $(id);
    return t(select?.selectedOptions?.[0]?.textContent || '');
  }
  function category(controlId, name, description, shape, value) {
    const section = $(controlId)?.closest('.settings-section');
    if (!section || section.hidden) return;
    const page = {section, name, value};
    section.classList.add('settings-detail-page');
    section.dataset.settingsPage = controlId;
    section.open = false;
    page.row = row(preferenceGroup, {name, description, shape, handler: () => showPage(page, true)});
    page.row.button.setAttribute('aria-controls', section.id || (section.id = 'settings-page-' + controlId));
    page.row.button.setAttribute('aria-expanded', 'false');
    section.addEventListener('toggle', () => {
      if (!dialog.open) return;
      if (section.open && active !== page) showPage(page, false);
      // The legacy accordion timer must not dismiss an active detail page.
      if (!section.open && active === page) section.open = true;
    });
    pages.push(page);
    return page;
  }
  function showPage(page, focus) {
    active = page;
    lastRow = page.row.button;
    dialog.classList.add('settings-detail-mode');
    overview.hidden = true;
    back.hidden = false;
    for (const item of pages) {
      const selected = item === page;
      item.section.dataset.active = String(selected);
      item.section.open = selected;
      item.row.button.setAttribute('aria-expanded', String(selected));
    }
    setText(title, t(page.name));
    dialog.scrollTop = 0;
    if (focus) title.focus({preventScroll:true});
    refresh();
  }
  function showOverview(focus = false) {
    active = null;
    dialog.classList.remove('settings-detail-mode');
    overview.hidden = false;
    back.hidden = true;
    for (const page of pages) {
      page.section.dataset.active = 'false';
      page.section.open = false;
      page.row.button.setAttribute('aria-expanded', 'false');
    }
    setText(title, t('Settings'));
    dialog.scrollTop = 0;
    refresh();
    if (focus) lastRow?.focus({preventScroll:true});
  }
  back.addEventListener('click', () => showOverview(true));

  const account = $('open-profile');
  const accountSection = account?.closest('.settings-section');
  if (accountSection) accountSection.classList.add('settings-command-source');
  const profileRow = row(accountGroup, {
    name: 'Profile & friends', description: 'Your profile, connections and private messages', shape: 'person',
    className: 'settings-profile-row', handler: () => account?.click()
  });
  profileRow.button.disabled = !account;
  category('theme-select', 'Appearance', 'Color, theme and language', 'settings', () => selectLabel('theme-select'));
  category('settings-movie-volume', 'Sound', 'Movie, conversation and notification sounds', 'volume', () => $('settings-movie-volume').value + '%');
  category('noise-setting', 'Call audio', 'Microphone processing and camera quality', 'mic', () => selectLabel('quality-select'));
  category('theatre-fit', 'Playback', 'Video fit and your viewing layout', 'play', () => selectLabel('theatre-fit'));

  const roomRow = row(moreGroup, {
    name: 'Room settings', description: 'People, room theme and shared playback', shape: 'people',
    handler: () => {
      if (!document.body.classList.contains('in-room')) return;
      dialog.close();
      $('room-settings-button')?.click();
    }
  });
  row(moreGroup, {
    name: 'Notifications', description: 'Room updates and friend requests', shape: 'bell',
    handler: () => $('nav-notifications')?.click()
  });
  row(moreGroup, {
    name: 'Privacy & your data', description: 'See how your information is used', shape: 'info',
    handler: () => { dialog.close(); $('privacy-open')?.click(); }
  });

  const footer = dialog.querySelector(':scope > .dialog-actions');
  const reset = $('reset-settings');
  const footerWrap = node('div', 'settings-footer');
  const footnote = node('p', 'settings-save-note', 'Save your changes when you’re done.');
  if (reset) {
    reset.classList.add('settings-reset-action');
    overview.append(reset);
  }
  if (footer) footerWrap.append(footnote, footer);
  dialog.append(footerWrap);

  const outputs = [];
  for (const id of ['settings-movie-volume', 'settings-call-volume', 'notification-volume']) {
    const control = $(id);
    if (!control) continue;
    const parent = control.closest('label');
    parent.classList.add('settings-volume-row');
    const output = node('output', 'settings-volume-value');
    output.htmlFor = id;
    output.setAttribute('aria-hidden', 'true');
    parent.append(output);
    outputs.push({control, output});
  }
  const notifications = $('notification-settings');
  if (notifications) {
    const heading = label(node('h3', 'settings-subheading'), 'Room alerts');
    notifications.prepend(heading);
  }
  const diagnosticSummary = $('audio-diagnostics')?.closest('details')?.querySelector('summary');
  if (diagnosticSummary) label(diagnosticSummary, 'Device audio information');
  const processingSummary = $('noise-setting')?.closest('section')?.querySelector('details.info > summary');
  if (processingSummary) label(processingSummary, 'How audio processing works');
  const roomDialog = $('room-settings-dialog');
  roomDialog?.classList.add('room-settings-redesign');
  $('room-host-settings')?.classList.add('settings-room-group');
  const roomFooter = roomDialog?.querySelector('.dialog-actions');
  if (roomFooter) roomDialog.append(roomFooter);
  for (const id of ['theme-select', 'quality-select', 'language-select', 'theatre-fit', 'room-theme']) {
    $(id)?.closest('label')?.classList.add('settings-choice-row');
  }
  const darkLabel = $('display-toggle')?.closest('label')?.querySelector('span');
  if (darkLabel) label(darkLabel, 'Dark theme');

  function refresh() {
    for (const item of labels) setText(item.element, t(item.key));
    for (const page of pages) setText(page.row.value, page.value?.() || '');
    for (const {control, output} of outputs) setText(output, control.value + '%');
    roomRow.button.hidden = !document.body.classList.contains('in-room');
    if (dialog.open) setText(title, t(active?.name || 'Settings'));
  }
  function handleOpen() {
    if (!dialog.open) return;
    // External notification navigation may already have opened the sound detail.
    const requested = pages.find(page => page.section.open);
    if (requested) showPage(requested, false);
    else showOverview();
    refresh();
  }
  dialog.addEventListener('toggle', handleOpen);
  dialog.addEventListener('input', refresh);
  dialog.addEventListener('change', refresh);
  reset?.addEventListener('click', refresh);
  dialog.addEventListener('close', () => { showOverview(); });
  document.addEventListener('xparty:localized', refresh);
  const api = {refresh, openCategory: id => {
    const page = pages.find(page => page.section.dataset.settingsPage === id);
    if (page) showPage(page, false);
  }};
  instances.set(dialog, api);
  showOverview();
  return api;
}
