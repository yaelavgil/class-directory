// Photo viewer + in-frame editor: pick (camera / gallery / file / drag-drop / paste), then pan & zoom inside the square.
// The card shows a 480px square crop; the downscaled original and the crop are kept so the framing can be redone later.
const OUT = 480;          // card image size
const ORIG_MAX = 1200;    // longest side of the stored original

const loadImage = src => new Promise((res, rej) => {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => res(img);
  img.onerror = () => rej(new Error('decode'));
  img.src = src;
});

// File/Blob/URL → downscaled JPEG data URL, so originals fit in a Firestore document.
export async function toOriginal(src) {
  const url = typeof src === 'string' ? src : URL.createObjectURL(src);
  const img = await loadImage(url);
  const k = Math.min(1, ORIG_MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}

// Opens the frame editor. Resolves { photo, original, crop } or null if cancelled.
export function openCropper({ original, crop, title = 'מיקום התמונה' }) {
  return new Promise(resolve => {
    const d = document.createElement('dialog');
    d.className = 'crop-dlg';
    d.innerHTML = `
      <h2>${title}</h2>
      <div class="cropframe" tabindex="0" aria-label="גררו להזזה, צביטה או גלגלת לזום"><img alt="" draggable="false"></div>
      <div class="zoomrow"><span aria-hidden="true">−</span><input type="range" min="1" max="4" step="0.01" value="1" aria-label="זום"><span aria-hidden="true">+</span></div>
      <p class="hint">גררו כדי להזיז · צביטה, גלגלת או הסרגל לזום</p>
      <div class="dlg-actions">
        <button class="btn" data-c="ok">שמירה</button>
        <label class="btn ghost">תמונה אחרת<input type="file" accept="image/*" hidden></label>
        <button class="btn ghost" data-c="cancel">ביטול</button>
      </div>`;
    document.body.append(d);
    const frame = d.querySelector('.cropframe'), img = frame.querySelector('img'), range = d.querySelector('input[type=range]');
    let F = 0, iw = 0, ih = 0, base = 1, z = 1, tx = 0, ty = 0, src = original, loaded = null;

    const clamp = () => {
      const w = iw * base * z, h = ih * base * z;
      const mx = Math.max(0, (w - F) / 2), my = Math.max(0, (h - F) / 2);
      tx = Math.min(mx, Math.max(-mx, tx)); ty = Math.min(my, Math.max(-my, ty));
    };
    const draw = () => {
      clamp();
      const s = base * z;
      img.style.width = iw * s + 'px'; img.style.height = ih * s + 'px';
      img.style.transform = `translate(${F / 2 - iw * s / 2 + tx}px, ${F / 2 - ih * s / 2 + ty}px)`;
      range.value = z;
    };
    const setZoom = (nz, cx = 0, cy = 0) => {  // zoom around a point given relative to frame centre
      nz = Math.min(4, Math.max(1, nz));
      const r = nz / z;
      tx = cx - (cx - tx) * r; ty = cy - (cy - ty) * r; z = nz;
      draw();
    };
    const load = async (s, c) => {
      src = s;
      const im = await loadImage(s);
      loaded = im;
      img.crossOrigin = 'anonymous'; img.src = s; iw = im.naturalWidth; ih = im.naturalHeight;
      F = frame.clientWidth; base = F / Math.min(iw, ih);
      z = c?.z || 1; tx = (c?.tx || 0) * F; ty = (c?.ty || 0) * F;
      draw();
    };

    // drag + pinch
    const pts = new Map();
    let last = null;
    const snapshot = () => {
      const a = [...pts.values()];
      if (a.length === 1) return { x: a[0].x, y: a[0].y, dist: 0 };
      return { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2, dist: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) };
    };
    frame.addEventListener('pointerdown', e => { frame.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); last = snapshot(); });
    frame.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const now = snapshot();
      tx += now.x - last.x; ty += now.y - last.y;
      if (pts.size > 1 && last.dist) {
        const r = frame.getBoundingClientRect();
        setZoom(z * now.dist / last.dist, now.x - r.left - F / 2, now.y - r.top - F / 2);
      } else draw();
      last = now;
    });
    const up = e => { pts.delete(e.pointerId); last = pts.size ? snapshot() : null; };
    frame.addEventListener('pointerup', up); frame.addEventListener('pointercancel', up);
    frame.addEventListener('wheel', e => {
      e.preventDefault();
      const r = frame.getBoundingClientRect();
      setZoom(z * Math.exp(-e.deltaY / 400), e.clientX - r.left - F / 2, e.clientY - r.top - F / 2);
    }, { passive: false });
    frame.addEventListener('keydown', e => {
      const step = 12, m = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
      if (m) { e.preventDefault(); tx += m[0]; ty += m[1]; draw(); }
      if (e.key === '+' || e.key === '=') setZoom(z * 1.1);
      if (e.key === '-') setZoom(z / 1.1);
    });
    range.addEventListener('input', () => setZoom(+range.value));

    const replace = async file => {
      if (!file || !file.type.startsWith('image/')) return;
      try { await load(await toOriginal(file), null); }
      catch { alert('לא הצלחנו לפתוח את הקובץ. נסו תמונה בפורמט JPG או PNG.'); }
    };
    d.querySelector('input[type=file]').addEventListener('change', e => replace(e.target.files[0]));
    d.addEventListener('dragover', e => e.preventDefault());
    d.addEventListener('drop', e => { e.preventDefault(); replace(e.dataTransfer.files[0]); });
    const onPaste = e => { const f = [...(e.clipboardData?.files || [])][0]; if (f) replace(f); };
    document.addEventListener('paste', onPaste);

    const finish = val => { document.removeEventListener('paste', onPaste); d.close(); d.remove(); resolve(val); };
    d.querySelector('[data-c=cancel]').onclick = () => finish(null);
    d.addEventListener('cancel', e => { e.preventDefault(); finish(null); });
    d.querySelector('[data-c=ok]').onclick = () => {
      const c = document.createElement('canvas'); c.width = c.height = OUT;
      const k = OUT / F, s = base * z;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, OUT, OUT);
      ctx.drawImage(loaded, (F / 2 - iw * s / 2 + tx) * k, (F / 2 - ih * s / 2 + ty) * k, iw * s * k, ih * s * k);
      finish({ photo: c.toDataURL('image/jpeg', 0.85), original: src, crop: { z: +z.toFixed(3), tx: +(tx / F).toFixed(4), ty: +(ty / F).toFixed(4) } });
    };

    d.showModal();
    requestAnimationFrame(() => load(original, crop).catch(() => finish(null)));
  });
}

// Lets the user pick an image from any source first (camera/gallery/files on phones, drag-drop/paste on desktop).
export function pickImage() {
  return new Promise(resolve => {
    const d = document.createElement('dialog');
    d.className = 'pick-dlg';
    d.innerHTML = `
      <h2>בחירת תמונה</h2>
      <label class="dropzone">
        <input type="file" accept="image/*" hidden>
        <span class="big">📷</span>
        <b>צילום, גלריה או קובץ</b>
        <span class="hint">אפשר גם לגרור לכאן תמונה או להדביק (Ctrl/⌘+V)</span>
      </label>
      <div class="dlg-actions"><button class="btn ghost" data-c="cancel">ביטול</button></div>`;
    document.body.append(d);
    const finish = async file => {
      document.removeEventListener('paste', onPaste);
      d.close(); d.remove();
      if (!file) return resolve(null);
      try { resolve(await toOriginal(file)); }
      catch { alert('לא הצלחנו לפתוח את הקובץ. נסו תמונה בפורמט JPG או PNG.'); resolve(null); }
    };
    const onPaste = e => { const f = [...(e.clipboardData?.files || [])].find(f => f.type.startsWith('image/')); if (f) finish(f); };
    document.addEventListener('paste', onPaste);
    d.querySelector('input').addEventListener('change', e => finish(e.target.files[0]));
    const dz = d.querySelector('.dropzone');
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('over'));
    dz.addEventListener('drop', e => { e.preventDefault(); finish([...e.dataTransfer.files].find(f => f.type.startsWith('image/'))); });
    d.querySelector('[data-c=cancel]').onclick = () => finish(null);
    d.addEventListener('cancel', e => { e.preventDefault(); finish(null); });
    d.showModal();
  });
}

// Full-size view. With canEdit, offers re-framing, a new image, or removal. onSave receives the editor result or { remove: true }.
export function openViewer({ name, photo, getOriginal, canEdit, onSave }) {
  const d = document.createElement('dialog');
  d.className = 'viewer-dlg';
  d.innerHTML = `
    <button class="x" aria-label="סגירה">×</button>
    <div class="bigphoto">${photo ? `<img src="${photo}" alt="${name}">` : `<span class="initials">${name[0] || '?'}</span>`}</div>
    <h2>${name}</h2>
    ${canEdit ? `<div class="dlg-actions">
      ${photo ? `<button class="btn" data-c="frame">מיקום וזום</button>` : ''}
      <button class="btn ${photo ? 'ghost' : ''}" data-c="new">${photo ? 'תמונה חדשה' : 'הוספת תמונה'}</button>
      ${photo ? `<button class="btn ghost danger" data-c="remove">הסרה</button>` : ''}
    </div>` : ''}`;
  document.body.append(d);
  const close = () => { d.close(); d.remove(); };
  d.querySelector('.x').onclick = close;
  d.addEventListener('click', e => { if (e.target === d) close(); });
  d.addEventListener('close', () => d.remove());
  const run = async (getSrc) => {
    const src = await getSrc();
    if (!src) return;
    close();
    const res = await openCropper(src);
    if (res) await onSave(res);
  };
  d.querySelector('[data-c=frame]')?.addEventListener('click', () => run(async () => (await getOriginal()) || { original: photo, crop: null }));
  d.querySelector('[data-c=new]')?.addEventListener('click', () => run(async () => { const o = await pickImage(); return o && { original: o, crop: null }; }));
  d.querySelector('[data-c=remove]')?.addEventListener('click', async () => {
    if (!confirm('להסיר את התמונה?')) return;
    close(); await onSave({ remove: true });
  });
  d.showModal();
}
