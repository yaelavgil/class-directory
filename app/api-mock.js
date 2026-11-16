// In-memory backend for local preview (?demo). Same interface as api-firebase.js.
// A persona switcher picks who is "signed in", so every role can be tried without real accounts.
import { PHOTO_SLOTS, slotField } from './slots.js';

const subs = new Set();
const fire = () => subs.forEach(f => f());
const sub = (fn) => { const f = () => fn(); subs.add(f); queueMicrotask(f); return () => subs.delete(f); };
const clone = o => JSON.parse(JSON.stringify(o));
let seq = 100;

export const PERSONAS = [
  { key: 'out', label: 'לא מחובר/ת', user: null },
  { key: 'admin', label: 'מנהלת', user: { uid: 'u-admin', email: 'admin@example.com', name: 'מנהלת לדוגמה', photo: '' } },
  { key: 'parent', label: 'הורה (כרטיס אחד)', user: { uid: 'u-par', email: 'parent@example.com', name: 'הורה לדוגמה', photo: '' } },
  { key: 'viewer', label: 'ילד/ה (צפייה)', user: { uid: 'u-kid', email: 'kid@example.com', name: 'ילד/ה לדוגמה', photo: '' } },
  { key: 'new', label: 'הורה חדש/ה', user: { uid: 'u-new', email: 'new@example.com', name: 'הורה חדש/ה', photo: '' } },
];

const S = { user: null, dirs: {}, members: {}, kids: {}, requests: {}, roster: {}, photos: {}, assets: {} };

// id: the directory the page asks for, so ?demo works on a class page and not only at the root.
export async function seedMock(id = 'd3-2026') {
  // The real roster (seed.local.json) is never published, so the demo falls back to fictional names
  // — which is what the published ?demo link runs on.
  const load = u => fetch(new URL(u, import.meta.url)).then(r => r.ok ? r.json() : Promise.reject()).catch(() => null);
  const kids = (await load('../seed.local.json')) || (await load('./demo-seed.json')) || [];
  const d = id;
  S.dirs[d] = { id: d, title: 'כיתה ד3', year: '2026-2027', school: 'בית ספר שדות', city: 'בת חפר', color: 'sky', doodles: true,
    settings: { joinMode: 'roster', fields: { birth: true, address: true, kidPhone: true, photo: true, memories: true, bookName: true, gender: true } },
    createdBy: 'admin@example.com' };
  S.kids[d] = {};
  for (const k of kids) S.kids[d][k.id] = { ...k };
  const ids = kids.map(k => k.id);
  if (ids[2]) S.kids[d][ids[2]].parentEmails = ['parent@example.com'];
  if (ids[0]) S.kids[d][ids[0]].parentEmails = ['admin@example.com'];
  S.members[d] = {
    'admin@example.com': { email: 'admin@example.com', name: 'מנהלת לדוגמה', role: 'admin', kids: ids.slice(0, 1) },
    'parent@example.com': { email: 'parent@example.com', name: 'הורה לדוגמה', role: 'parent', kids: ids.slice(2, 3) },
    'kid@example.com': { email: 'kid@example.com', name: 'ילד/ה לדוגמה', role: 'viewer', kids: [] },
  };
  S.requests[d] = {
    'u-x1': { id: 'u-x1', uid: 'u-x1', email: 'req1@example.com', name: 'בקשה לדוגמה', role: 'parent', kids: ids.slice(1, 2), note: 'הורה של הילד/ה השני ברשימה (לדוגמה)' },
    'u-x2': { id: 'u-x2', uid: 'u-x2', email: 'req2@example.com', name: 'בקשה נוספת', role: 'parent', kids: [], newKid: { first: 'נטע', last: 'כהן' }, note: 'הצטרפה השנה' },
  };
  S.roster[d] = kids.map(k => ({ id: k.id, label: `${k.first} ${k.last}` }));
}

let userCb = null;
export function setPersona(key) {
  S.user = PERSONAS.find(p => p.key === key)?.user || null;
  userCb?.(S.user && { ...S.user });
  fire();
}

const me = () => S.user?.email;

export const api = {
  mode: 'mock',
  onUser(cb) { userCb = cb; queueMicrotask(() => cb(S.user && { ...S.user })); return () => { userCb = null; }; },
  async signInGoogle() { setPersona('new'); },
  async sendEmailLink() {},
  async completeEmailLink() { return false; },
  async signOut() { setPersona('out'); },

  async isCreator() { return me() === 'admin@example.com'; },
  async getDir(id) { return S.dirs[id] ? clone(S.dirs[id]) : null; },
  watchDir(id, cb) { return sub(() => cb(S.dirs[id] ? clone(S.dirs[id]) : null)); },
  async myDirs() {
    return Object.keys(S.members).filter(d => S.members[d][me()]).map(d => ({ ...clone(S.dirs[d]), role: S.members[d][me()].role }));
  },
  async dirExists(id) { return !!S.dirs[id]; },
  async createDir(id, data, u) {
    S.dirs[id] = { id, ...clone(data), createdBy: u.email };
    S.members[id] = { [u.email]: { email: u.email, name: u.name, role: 'admin', kids: [] } };
    S.kids[id] = {}; S.requests[id] = {}; S.roster[id] = [];
    fire();
  },
  async updateDir(id, patch) { Object.assign(S.dirs[id], clone(patch)); fire(); },

  watchMembership(id, cb) { return sub(() => cb(S.members[id]?.[me()] ? clone(S.members[id][me()]) : null)); },
  watchMembers(id, cb) { return sub(() => cb(Object.entries(S.members[id] || {}).map(([k, v]) => ({ id: k, ...clone(v) })))); },
  async setMember(id, addr, data) {
    addr = addr.toLowerCase();
    S.members[id][addr] = { email: addr, kids: [], ...(S.members[id][addr] || {}), ...clone(data) };
    fire();
  },
  async linkParent(id, addr, kidIds, linked) {
    for (const k of kidIds) {
      const pe = new Set(S.kids[id][k].parentEmails || []);
      linked ? pe.add(addr) : pe.delete(addr);
      S.kids[id][k].parentEmails = [...pe];
    }
    const m = S.members[id][addr];
    if (m) { const ks = new Set(m.kids || []); kidIds.forEach(k => linked ? ks.add(k) : ks.delete(k)); m.kids = [...ks]; }
    fire();
  },
  async removeMember(id, addr, kidIds) {
    delete S.members[id][addr];
    for (const k of kidIds) S.kids[id][k].parentEmails = (S.kids[id][k].parentEmails || []).filter(e => e !== addr);
    fire();
  },

  async getRoster(id) { return clone(S.roster[id] || []); },
  async setRoster(id, names) { S.roster[id] = clone(names); },
  async requestJoin(id, u, req) { S.requests[id][u.uid] = { id: u.uid, uid: u.uid, email: u.email, name: u.name, ...clone(req) }; fire(); },
  watchMyRequest(id, u, cb) { return sub(() => cb(S.requests[id]?.[u.uid] ? clone(S.requests[id][u.uid]) : null)); },
  async cancelRequest(id, u) { delete S.requests[id][u.uid]; fire(); },
  watchRequests(id, cb) { return sub(() => cb(Object.values(S.requests[id] || {}).map(clone))); },
  async approve(id, req, { role, kids, newKidId, newKid }) {
    const linked = [...kids];
    if (newKid) { S.kids[id][newKidId] = { id: newKidId, ...clone(newKid), parentEmails: [req.email] }; linked.push(newKidId); }
    S.members[id][req.email] = { email: req.email, name: req.name, role, kids: linked };
    for (const k of kids) S.kids[id][k].parentEmails = [...new Set([...(S.kids[id][k].parentEmails || []), req.email])];
    delete S.requests[id][req.id];
    fire();
  },
  async reject(id, req) { delete S.requests[id][req.id]; fire(); },

  watchKids(id, cb) { return sub(() => cb(Object.entries(S.kids[id] || {}).map(([k, v]) => ({ ...clone(v), id: k })))); },
  newKidId() { return 'k' + (++seq); },
  async createKid(id, kidId, data) { S.kids[id][kidId] = { ...clone(data), id: kidId }; fire(); },
  async saveKid(id, kidId, patch, u) { Object.assign(S.kids[id][kidId], clone(patch), { updatedBy: u.email }); fire(); },
  async addKidsBulk(id, kids) {
    for (const k of kids) { const kidId = k.id || 'k' + (++seq); S.kids[id][kidId] = { parentEmails: [], ...clone(k), id: kidId }; }
    fire();
  },
  async hardDeleteKid(id, kidId) {
    delete S.kids[id][kidId]; delete S.photos[id + kidId];
    for (const s of PHOTO_SLOTS) delete S.assets[id + kidId + s.slot];
    fire();
  },
  async getPhoto(id, kidId) { return S.photos[id + kidId] ? clone(S.photos[id + kidId]) : null; },
  async savePhoto(id, kidId, res) {
    if (res.remove) { S.kids[id][kidId].photo = ''; delete S.photos[id + kidId]; }
    else { S.kids[id][kidId].photo = res.photo; S.photos[id + kidId] = { original: res.original, crop: res.crop || null }; }
    fire();
  },

  async getAsset(id, kidId, slot) {
    const a = S.assets[id + kidId + slot];
    return a ? clone(a) : null;
  },
  async saveAsset(id, kidId, slot, res) {
    const field = slotField(slot);
    if (!field) throw new Error('unknown slot: ' + slot);
    if (res.remove) { S.kids[id][kidId][field] = ''; delete S.assets[id + kidId + slot]; }
    else {
      S.kids[id][kidId][field] = res.thumb;
      S.assets[id + kidId + slot] = { photo: res.photo, original: res.original, crop: res.crop || null };
    }
    fire();
  },
};
