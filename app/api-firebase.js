// Firestore/Auth backend. Same interface as api-mock.js.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut,
  sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, collectionGroup, query, where,
  onSnapshot, writeBatch, serverTimestamp, arrayUnion, arrayRemove, getDocs,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { FIREBASE_CONFIG } from './config.js';

const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);
const EMAIL_KEY = 'cd.emailForSignIn';

const email = () => (auth.currentUser?.email || '').toLowerCase();
const userOut = u => u && { uid: u.uid, email: u.email.toLowerCase(), name: u.displayName || '', photo: u.photoURL || '' };
const snapList = s => s.docs.map(d => ({ id: d.id, ...d.data() }));
const watch = (ref, cb, map) => onSnapshot(ref, s => cb(map(s)), err => { console.warn(err); cb(map(null)); });

export const api = {
  mode: 'firebase',

  // ---------- auth ----------
  onUser(cb) { return onAuthStateChanged(auth, u => cb(userOut(u))); },
  signInGoogle() { return signInWithPopup(auth, new GoogleAuthProvider()); },
  async sendEmailLink(addr) {
    await sendSignInLinkToEmail(auth, addr, { url: location.href.split('#')[0], handleCodeInApp: true });
    try { localStorage.setItem(EMAIL_KEY, addr); } catch {}
  },
  async completeEmailLink(askEmail) {
    if (!isSignInWithEmailLink(auth, location.href)) return false;
    let addr = null;
    try { addr = localStorage.getItem(EMAIL_KEY); } catch {}
    if (!addr) addr = await askEmail();
    if (!addr) return false;
    await signInWithEmailLink(auth, addr, location.href);
    try { localStorage.removeItem(EMAIL_KEY); } catch {}
    history.replaceState(null, '', location.pathname);
    return true;
  },
  signOut() { return fbSignOut(auth); },

  // ---------- directories ----------
  // creators/{email} marks who may open directories. The owner (hard-coded in the rules only) self-registers on first sign-in.
  async isCreator() {
    try {
      if ((await getDoc(doc(db, 'creators', email()))).exists()) return true;
      await setDoc(doc(db, 'creators', email()), { at: serverTimestamp() });
      return true;
    } catch { return false; }
  },
  async getDir(id) {
    const s = await getDoc(doc(db, 'dirs', id));
    return s.exists() ? { id, ...s.data() } : null;
  },
  watchDir(id, cb) { return watch(doc(db, 'dirs', id), cb, s => s?.exists() ? { id, ...s.data() } : null); },
  async myDirs() {
    const ms = await getDocs(query(collectionGroup(db, 'members'), where('email', '==', email())));
    const out = [];
    for (const m of ms.docs) {
      const dirId = m.ref.parent.parent.id;
      const dir = await this.getDir(dirId);
      if (dir) out.push({ ...dir, role: m.data().role });
    }
    return out;
  },
  async dirExists(id) { return (await getDoc(doc(db, 'dirs', id))).exists(); },
  async createDir(id, data, me) {
    const b = writeBatch(db);
    b.set(doc(db, 'dirs', id), { ...data, createdBy: me.email, createdAt: serverTimestamp() });
    b.set(doc(db, 'dirs', id, 'members', me.email), { email: me.email, name: me.name, role: 'admin', kids: [], addedAt: serverTimestamp(), addedBy: me.email });
    b.set(doc(db, 'dirs', id, 'public', 'roster'), { names: [] });
    await b.commit();
  },
  updateDir(id, patch) { return updateDoc(doc(db, 'dirs', id), patch); },

  // ---------- membership ----------
  watchMembership(id, cb) { return watch(doc(db, 'dirs', id, 'members', email()), cb, s => s?.exists() ? s.data() : null); },
  watchMembers(id, cb) { return watch(collection(db, 'dirs', id, 'members'), cb, s => s ? snapList(s) : []); },
  async setMember(id, addr, data, me) {
    addr = addr.toLowerCase();
    const b = writeBatch(db);
    b.set(doc(db, 'dirs', id, 'members', addr), { email: addr, kids: [], addedAt: serverTimestamp(), addedBy: me.email, ...data }, { merge: true });
    await b.commit();
  },
  async linkParent(id, addr, kidIds, linked) {
    const b = writeBatch(db);
    const op = linked ? arrayUnion : arrayRemove;
    for (const k of kidIds) b.update(doc(db, 'dirs', id, 'kids', k), { parentEmails: op(addr) });
    b.update(doc(db, 'dirs', id, 'members', addr), { kids: op(...kidIds) });
    await b.commit();
  },
  async removeMember(id, addr, kidIds) {
    const b = writeBatch(db);
    b.delete(doc(db, 'dirs', id, 'members', addr));
    for (const k of kidIds) b.update(doc(db, 'dirs', id, 'kids', k), { parentEmails: arrayRemove(addr) });
    await b.commit();
  },

  // ---------- join requests ----------
  async getRoster(id) {
    try { return (await getDoc(doc(db, 'dirs', id, 'public', 'roster'))).data()?.names || []; } catch { return []; }
  },
  setRoster(id, names) { return setDoc(doc(db, 'dirs', id, 'public', 'roster'), { names }); },
  requestJoin(id, me, req) {
    return setDoc(doc(db, 'dirs', id, 'requests', me.uid), { ...req, uid: me.uid, email: me.email, name: me.name, photo: me.photo, at: serverTimestamp() });
  },
  watchMyRequest(id, me, cb) { return watch(doc(db, 'dirs', id, 'requests', me.uid), cb, s => s?.exists() ? s.data() : null); },
  cancelRequest(id, me) { return deleteDoc(doc(db, 'dirs', id, 'requests', me.uid)); },
  watchRequests(id, cb) { return watch(collection(db, 'dirs', id, 'requests'), cb, s => s ? snapList(s) : []); },
  async approve(id, req, { role, kids, newKidId, newKid }, me) {
    const b = writeBatch(db);
    const linked = [...kids];
    if (newKid) {
      b.set(doc(db, 'dirs', id, 'kids', newKidId), { ...newKid, parentEmails: [req.email], createdAt: serverTimestamp(), createdBy: me.email });
      linked.push(newKidId);
    }
    b.set(doc(db, 'dirs', id, 'members', req.email), { email: req.email, name: req.name || '', role, kids: linked, addedAt: serverTimestamp(), addedBy: me.email });
    for (const k of kids) b.update(doc(db, 'dirs', id, 'kids', k), { parentEmails: arrayUnion(req.email) });
    b.delete(doc(db, 'dirs', id, 'requests', req.id));
    await b.commit();
  },
  reject(id, req) { return deleteDoc(doc(db, 'dirs', id, 'requests', req.id)); },

  // ---------- kids ----------
  watchKids(id, cb) { return watch(collection(db, 'dirs', id, 'kids'), cb, s => s ? snapList(s) : []); },
  newKidId(id) { return doc(collection(db, 'dirs', id, 'kids')).id; },
  createKid(id, kidId, data, me) {
    return setDoc(doc(db, 'dirs', id, 'kids', kidId), { ...data, createdAt: serverTimestamp(), createdBy: me.email });
  },
  saveKid(id, kidId, patch, me) {
    return updateDoc(doc(db, 'dirs', id, 'kids', kidId), { ...patch, updatedAt: serverTimestamp(), updatedBy: me.email });
  },
  async addKidsBulk(id, kids, me) {
    for (let i = 0; i < kids.length; i += 400) {
      const b = writeBatch(db);
      for (const k of kids.slice(i, i + 400)) {
        const { id: kidId = doc(collection(db, 'dirs', id, 'kids')).id, ...data } = k;
        b.set(doc(db, 'dirs', id, 'kids', kidId), { parentEmails: [], ...data, createdAt: serverTimestamp(), createdBy: me.email });
      }
      await b.commit();
    }
  },
  hardDeleteKid(id, kidId) {
    const b = writeBatch(db);
    b.delete(doc(db, 'dirs', id, 'kids', kidId));
    b.delete(doc(db, 'dirs', id, 'photos', kidId));
    return b.commit();
  },

  // Card image lives on the kid doc; the larger original + framing sit in photos/{kidId} so the list stays light.
  async getPhoto(id, kidId) {
    const s = await getDoc(doc(db, 'dirs', id, 'photos', kidId));
    return s.exists() ? s.data() : null;
  },
  async savePhoto(id, kidId, res, me) {
    const b = writeBatch(db);
    if (res.remove) {
      b.update(doc(db, 'dirs', id, 'kids', kidId), { photo: '', updatedAt: serverTimestamp(), updatedBy: me.email });
      b.delete(doc(db, 'dirs', id, 'photos', kidId));
    } else {
      b.update(doc(db, 'dirs', id, 'kids', kidId), { photo: res.photo, updatedAt: serverTimestamp(), updatedBy: me.email });
      b.set(doc(db, 'dirs', id, 'photos', kidId), { original: res.original, crop: res.crop || null, at: serverTimestamp(), by: me.email });
    }
    await b.commit();
  },
};
