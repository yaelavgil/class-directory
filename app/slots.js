// Extra photo slots beyond the card photo.
// Each slot keeps a 144px thumbnail on the kid document (so lists stay light) and a
// dirs/{d}/kids/{kidId}/assets/{slot} document with the 480px crop, the 1200px original and the framing.
// One document per slot: a Firestore document caps at 1MB, and several 1200px originals never fit in one.
// Adding a slot here is all it takes — the rules already allow any slot id.
export const PHOTO_SLOTS = [
  { slot: 'baby', field: 'babyPhoto', label: 'תמונת תינוקות', short: 'תינוקות' },
  { slot: 'grade1', field: 'grade1Photo', label: 'תמונה מכיתה א׳', short: 'כיתה א׳' },
];

export const slotField = slot => PHOTO_SLOTS.find(s => s.slot === slot)?.field;

// Thumbnail kept on the kid document. Small on purpose: every member downloads every kid's document.
export const THUMB = 144;
