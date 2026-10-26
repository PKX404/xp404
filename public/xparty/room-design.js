// Room presentation uses the existing transport and action controls.
// Layout reference: Xparty's participant list and chat composer; independently implemented.
const instances = new WeakMap();

export function initRoomDesign({getContext}) {
  const roomElement = document.getElementById('room');
  if (!roomElement) return {update() {}, destroy() {}};
  if (instances.has(roomElement)) return instances.get(roomElement);
  const $ = id => document.getElementById(id);
  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  };
  const action = (label, className, handler) => {
    const button = node('button', className, label);
    button.type = 'button';
    button.addEventListener('click', handler);
    return button;
  };
  const drawer = $('participants-drawer');
  const memberList = $('member-list');
  const peopleButton = $('people-button');
  let previousFocus = null;
  let previousRoom = null;
  let destroyed = false;

  const scene = node('div', 'room-scene-header');
  const sceneInfo = node('div', 'room-scene-info');
  const eyebrow = node('span', 'room-eyebrow', 'YOUR WATCH ROOM');
  const sceneTitle = node('h1', 'room-scene-title', 'Make a night of it.');
  sceneInfo.append(eyebrow, sceneTitle);
  const sceneActions = node('div', 'room-scene-actions');
  const people = peopleButton;
  people.setAttribute('aria-controls', 'participants-drawer');
  people.setAttribute('aria-expanded', 'false');
  // The single Participants control lives in the room header.
  scene.append(sceneInfo, sceneActions);
  roomElement.querySelector('.room-grid')?.before(scene);
  const tools=node('div','room-scene-tools');
  const sources=action('Watch sources','secondary',()=> $('browse')?.click());sources.setAttribute('aria-label','Choose a video service');
  tools.append(sources);
  scene.after(tools);

  const drawerIntro = node('div', 'room-drawer-intro');
  const drawerCount = node('p', 'room-drawer-count');
  const searchLabel = node('label', 'room-member-search');
  const searchText = node('span', 'room-visually-hidden', 'Find a participant');
  const search = node('input');
  search.type = 'search';
  search.placeholder = 'Find a participant';
  search.autocomplete = 'off';
  search.maxLength = 80;
  searchLabel.append(searchText, search);
  drawerIntro.append(drawerCount, searchLabel);
  const noResults = node('p', 'room-member-empty', 'No one matches that name.');
  noResults.hidden = true;
  noResults.setAttribute('role', 'status');
  drawer?.querySelector('.drawer-heading')?.after(drawerIntro);
  memberList?.after(noResults);
  if (drawer) {
    drawer.setAttribute('aria-label', 'People in this room');
    drawer.setAttribute('tabindex', '-1');
  }
  peopleButton?.setAttribute('aria-controls', 'participants-drawer');

  // Keep the original controls and their moderation / call permission checks.
  function openProfile(id) {
    const context = getContext();
    const index = context.room?.people.findIndex(person => person.id === id) ?? -1;
    if (index < 0) return;
    const button = document.querySelector('.member-roster')?.children[index];
    if (!button) return;
    if (drawer) drawer.open = false;
    button.click();
  }
  function avatar(person) {
    const validPhoto = typeof person.profile?.photo === 'string'
      && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(person.profile.photo)
      && person.profile.photo.length <= 40000;
    const element = node(validPhoto ? 'img' : 'span', 'room-member-avatar');
    if (validPhoto) {
      element.src = person.profile.photo;
      element.alt = '';
      element.decoding = 'async';
    } else {
      element.textContent = (person.name || '?').slice(0, 1).toUpperCase();
      element.setAttribute('aria-hidden', 'true');
    }
    return element;
  }
  function filterMembers() {
    const term = search.value.trim().toLocaleLowerCase();
    let visible = 0;
    for (const row of memberList?.children || []) {
      const matches = !term || (row.dataset.searchName || '').includes(term);
      row.hidden = !matches;
      if (matches) visible++;
    }
    noResults.hidden = !term || visible > 0;
  }
  search.addEventListener('input', filterMembers);

  function update() {
    if (destroyed) return;
    const {room, me} = getContext();
    scene.hidden = true;
    tools.hidden = !room;
    if (!room) {
      if (drawer) drawer.open = false;
      previousRoom = null;
      search.value = '';
      return;
    }
    if (previousRoom !== room.code) {
      search.value = '';
      previousRoom = room.code;
    }
    const online = room.people.filter(person => person.online).length;
    const title = room.source?.title || 'Make a night of it.';
    if (sceneTitle.textContent !== title) sceneTitle.textContent = title;
    eyebrow.textContent = room.source ? 'WATCHING TOGETHER' : 'YOUR WATCH ROOM';
    people.setAttribute('aria-label', 'Participants · ' + online);
    drawerCount.textContent = online + ' here now · ' + room.people.filter(person => person.online && person.inCall).length + ' in the call';
    for (const [index, row] of [...(memberList?.children || [])].entries()) {
      const person = room.people[index];
      if (!person) continue;
      row.dataset.searchName = String(person.name || '').toLocaleLowerCase();
      row.dataset.online = String(!!person.online);
      if (row.querySelector('.room-member-identity')) continue;
      const identity = action('', 'room-member-identity', () => openProfile(person.id));
      identity.setAttribute('aria-label', 'View ' + person.name + ' profile');
      const text = node('span', 'room-member-text');
      text.append(node('strong', 'room-member-name', person.name + (person.id === me ? ' · You' : '')));
      const state = [person.id === room.hostId ? 'Host' : 'Guest', !person.online ? 'Reconnecting' : person.inCall ? (person.mic ? 'Mic on' : 'In the call') : 'Watching'];
      text.append(node('span', 'room-member-state', state.join(' · ')));
      identity.append(avatar(person), text);
      // renderMembers reconstructs these rows; only this row's redundant name is hidden.
      const originalLabel = row.firstElementChild;
      if (originalLabel?.tagName === 'SPAN') originalLabel.hidden = true;
      row.prepend(identity);
    }
    filterMembers();
    for (const tile of $('participants')?.children || []) {
      const person = room.people.find(person => person.id === tile.dataset.id);
      const photo = person?.profile?.photo || '';
      const current = tile.querySelector('.room-call-photo');
      if (current?.dataset.photo === photo) continue;
      current?.remove();
      if (!person || !photo) continue;
      const image = avatar(person);
      if (image.tagName !== 'IMG') continue;
      image.className = 'room-call-photo';
      image.dataset.photo = photo;
      tile.prepend(image);
    }
  }

  function drawerToggled() {
    const open = !!drawer?.open;
    people.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('room-people-open', open);
    if (open) {
      previousFocus = document.activeElement;
      update();
      // The search retains focus, keeping the existing inactivity timer from closing the panel mid-task.
      search.focus({preventScroll:true});
    } else if (previousFocus && drawer?.contains(document.activeElement)) {
      if (previousFocus.isConnected) previousFocus.focus({preventScroll:true});
      previousFocus = null;
    }
  }
  drawer?.addEventListener('toggle', drawerToggled);
  // Give the persistent participant heading an actual discoverable action.
  const participantHeading = roomElement.querySelector('.participant-strip h2');
  let headingButton;
  if (participantHeading) {
    headingButton = node('span', 'room-participants-label');
    headingButton.setAttribute('aria-label', 'Room occupancy');
    headingButton.append(...participantHeading.childNodes);
    participantHeading.append(headingButton);
  }
  const input = $('message-input');
  if (input) {
    input.setAttribute('enterkeyhint', 'send');
    input.setAttribute('autocapitalize', 'sentences');
    input.setAttribute('spellcheck', 'true');
  }
  const api = {
    update,
    destroy() {
      destroyed = true;
      drawer?.removeEventListener('toggle', drawerToggled);
      document.body.classList.remove('room-people-open');
      scene.remove();
      drawerIntro.remove();
      noResults.remove();
      if (headingButton) headingButton.replaceWith(...headingButton.childNodes);
      for (const row of memberList?.children || []) {
        row.querySelector('.room-member-identity')?.remove();
        const label = row.querySelector(':scope > span');
        if (label) label.hidden = false;
        row.hidden = false;
      }
      for (const image of roomElement.querySelectorAll('.room-call-photo')) image.remove();
      instances.delete(roomElement);
    }
  };
  instances.set(roomElement, api);
  update();
  return api;
}
