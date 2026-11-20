import type { FrameData, OrbFrame, Renderer } from './renderer.js';
import { ORB_BOX, STYLE_ID, STYLES } from './styles.js';

interface OrbView {
  el: HTMLButtonElement;
  blur: HTMLImageElement | null;
  shade: HTMLElement;
  title: HTMLElement;
  // Last written values, so unchanged properties are not written again.
  transform: string;
  opacity: string;
  z: string;
  interactive: boolean;
  lit: boolean;
  focused: boolean;
  blurOpacity: string;
  shadeOpacity: string;
  titleOpacity: string;
  titleKey: string;
  titleWidth: number;
  titleShift: number;
  titleStep: number;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.className = className;
  return node;
};

// The style element is shared by every cloud on the page and removed with the last one.
let liveClouds = 0;

function injectStyles(): void {
  liveClouds++;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLES;
  document.head.appendChild(style);
}

function releaseStyles(): void {
  liveClouds = Math.max(0, liveClouds - 1);
  if (!liveClouds) document.getElementById(STYLE_ID)?.remove();
}

/** Draws orbs as page elements and the tag lines on one canvas behind them. */
export function createDomRenderer(container: HTMLElement): Renderer {
  injectStyles();
  // The cloud is positioned inside its container. A static container is made
  // relative, and given back as it was on destroy.
  let positioned = false;
  if (typeof getComputedStyle === 'function' && ['static', ''].includes(getComputedStyle(container).position)) {
    container.style.position = 'relative';
    positioned = true;
  }

  const root = el('div', 'driftfield');
  const backdrop = el('div', 'driftfield-backdrop');
  const floor = el('div', 'driftfield-floor');
  const canvas = el('canvas', 'driftfield-lines');
  const layer = el('div', 'driftfield-orbs');
  root.append(backdrop, floor, canvas, layer);
  container.appendChild(root);

  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = canvas.getContext('2d');
  } catch {
    ctx = null;
  }

  let labelFont = '';

  const views = new Map<string, OrbView>();
  let canvasW = 0;
  let canvasH = 0;
  let canvasRatio = 0;
  let floorOpacity = '';

  function createView(orb: OrbFrame, before: Element | null): OrbView {
    const button = el('button', 'driftfield-orb');
    button.type = 'button';
    button.dataset.id = orb.item.id;
    button.setAttribute('aria-label', orb.item.title ?? '');

    const disc = el('div', 'driftfield-disc');
    let blur: HTMLImageElement | null = null;
    if (orb.item.image) {
      const sharp = el('img', 'driftfield-img');
      blur = el('img', 'driftfield-img driftfield-img-blur');
      for (const img of [sharp, blur]) {
        img.alt = '';
        img.draggable = false;
        img.decoding = 'async';
        // A broken image falls back to the neutral fill underneath.
        img.addEventListener('error', () => img.remove(), { once: true });
        img.src = orb.item.image;
        disc.appendChild(img);
      }
    }
    const shade = el('div', 'driftfield-shade');
    const title = el('span', 'driftfield-title');
    const text = document.createElement('span');
    text.textContent = orb.item.title ?? '';
    title.appendChild(text);
    disc.append(el('div', 'driftfield-band'), shade, el('div', 'driftfield-rim'));
    button.append(disc, title);
    // Kept in sequence order so keyboard focus moves through the items in order.
    layer.insertBefore(button, before);

    return {
      el: button, blur, shade, title,
      transform: '', opacity: '', z: '', interactive: true, lit: false, focused: false,
      blurOpacity: '', shadeOpacity: '', titleOpacity: '', titleKey: '', titleWidth: 0, titleShift: 0, titleStep: 0,
    };
  }

  function drawLines(frame: FrameData): void {
    const ratio = Math.min(2, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1);
    if (frame.width !== canvasW || frame.height !== canvasH || ratio !== canvasRatio) {
      canvasW = frame.width;
      canvasH = frame.height;
      canvasRatio = ratio;
      canvas.width = Math.max(1, Math.round(frame.width * ratio));
      canvas.height = Math.max(1, Math.round(frame.height * ratio));
      labelFont = '';
    }
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, frame.width, frame.height);
    ctx.lineCap = 'round';

    ctx.shadowBlur = 0;
    ctx.lineWidth = 1;
    for (const line of frame.lines) {
      if (line.lit || line.alpha <= 0.01) continue;
      ctx.strokeStyle = `rgba(150,180,255,${(0.22 * line.alpha).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(line.x1, line.y1);
      ctx.lineTo(line.x2, line.y2);
      ctx.stroke();
    }

    ctx.shadowColor = '#2f6bff';
    ctx.shadowBlur = 14;
    ctx.lineWidth = 2.5;
    for (const line of frame.lines) {
      if (!line.lit || line.alpha <= 0.01) continue;
      ctx.strokeStyle = `rgba(70,125,255,${Math.min(1, 0.35 + 0.65 * line.alpha).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(line.x1, line.y1);
      ctx.lineTo(line.x2, line.y2);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }

  function drawLabels(frame: FrameData): void {
    // Drawn on the lines' own canvas, after the lines, so the names sit on the
    // lines and behind the orbs.
    const c = ctx;
    if (!c) return;
    const size = frame.labelSize;
    const labelled = size > 0 ? frame.lines.filter((line) => line.label && line.alpha > 0.05) : [];
    if (!labelled.length) return;
    if (!labelFont) labelFont = getComputedStyle(root).fontFamily || 'sans-serif';
    c.font = `700 ${size}px ${labelFont}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineWidth = 1;
    const h = size * 1.7;
    for (const line of labelled) {
      const w = c.measureText(line.label).width + size * 1.3;
      const reach = w / 2 + 4;
      const x = reach * 2 >= frame.width ? frame.width / 2 : Math.min(frame.width - reach, Math.max(reach, line.lx));
      const y = Math.min(frame.height - h / 2 - 4, Math.max(h / 2 + 4, line.ly));
      c.save();
      c.translate(x, y);
      c.globalAlpha = Math.min(1, line.alpha * 1.5);
      c.beginPath();
      c.arc(-w / 2 + h / 2, 0, h / 2, Math.PI / 2, -Math.PI / 2);
      c.arc(w / 2 - h / 2, 0, h / 2, -Math.PI / 2, Math.PI / 2);
      c.closePath();
      c.fillStyle = 'rgba(8,16,44,.94)';
      c.fill();
      // The outline glows like the lit line it sits on.
      c.shadowColor = '#2f6bff';
      c.shadowBlur = 14;
      c.lineWidth = 1.5;
      c.strokeStyle = 'rgba(70,125,255,1)';
      c.stroke();
      c.shadowBlur = 0;
      c.fillStyle = '#fff';
      c.fillText(line.label, 0, size * 0.06);
      c.restore();
    }
  }

  return {
    root,

    render(frame: FrameData): void {
      const seen = new Set<string>();
      for (let i = 0; i < frame.orbs.length; i++) {
        const orb = frame.orbs[i];
        if (orb.p.opacity <= 0.01) continue;
        const id = orb.item.id;
        seen.add(id);
        let view = views.get(id);
        if (!view) {
          let before: Element | null = null;
          for (let j = i + 1; j < frame.orbs.length && !before; j++) before = views.get(frame.orbs[j].item.id)?.el ?? null;
          views.set(id, (view = createView(orb, before)));
        }

        const scale = (2 * orb.r) / ORB_BOX;
        const transform = `translate3d(${(orb.x - ORB_BOX / 2).toFixed(1)}px,${(orb.y - ORB_BOX / 2).toFixed(1)}px,0) scale(${scale.toFixed(4)})`;
        if (transform !== view.transform) view.el.style.transform = view.transform = transform;
        const opacity = orb.p.opacity.toFixed(3);
        if (opacity !== view.opacity) view.el.style.opacity = view.opacity = opacity;
        const z = String(orb.p.z + (orb.focused ? 2000 : 0));
        if (z !== view.z) view.el.style.zIndex = view.z = z;
        if (orb.p.interactive !== view.interactive) {
          view.interactive = orb.p.interactive;
          view.el.style.pointerEvents = orb.p.interactive ? 'auto' : 'none';
          view.el.tabIndex = orb.p.interactive ? 0 : -1;
        }
        if (orb.lit !== view.lit) view.el.classList.toggle('is-lit', (view.lit = orb.lit));
        if (orb.focused !== view.focused) view.el.classList.toggle('is-focused', (view.focused = orb.focused));

        const lifted = orb.lit || orb.focused;
        if (view.blur) {
          const blurOpacity = (lifted ? 0 : orb.p.blur * frame.blur).toFixed(2);
          if (blurOpacity !== view.blurOpacity) {
            view.blur.style.opacity = view.blurOpacity = blurOpacity;
            // A hidden blurred copy costs nothing, which matters most while an orb is enlarged.
            view.blur.style.display = blurOpacity === '0.00' ? 'none' : '';
          }
        }
        const shadeOpacity = (lifted ? orb.p.dim * 0.35 : orb.p.dim).toFixed(2);
        if (shadeOpacity !== view.shadeOpacity) view.shade.style.opacity = view.shadeOpacity = shadeOpacity;
        // The orb is sized by scaling its box, which would scale the title with
        // it. The title is given the inverse size instead, so it stays at a
        // readable size on screen whatever the size of its orb.
        const t = frame.title;
        const depthScale = Math.min(1, orb.p.scale);
        const hide = t.hideScale;
        // A narrow band, so a title is either readable or absent, not a faint ghost.
        const visible = lifted ? 1 : Math.min(1, Math.max(0, (depthScale - hide) / 0.04));
        const titleOpacity = (visible * (lifted ? 1 : 1 - 0.3 * orb.p.dim)).toFixed(2);
        if (titleOpacity !== view.titleOpacity) {
          view.title.style.opacity = view.titleOpacity = titleOpacity;
          view.title.style.display = titleOpacity === '0.00' ? 'none' : '';
        }
        if (titleOpacity !== '0.00') {
          const step = Math.max(0.02, Math.round(scale * 50) / 50);
          // Follows the orb's diameter on screen, ignoring the growth of a fly-through.
          const onScreen = Math.max(t.minSize, Math.min(t.size, (t.ratio * ORB_BOX * step) / Math.max(1, orb.p.scale)));
          const key = `${step}|${onScreen.toFixed(1)}|${t.width}|${t.lines}`;
          if (key !== view.titleKey) {
            view.titleKey = key;
            const widthOnScreen = Math.max(t.width * ORB_BOX * step, onScreen * 8.5);
            view.title.style.fontSize = `${(onScreen / step).toFixed(2)}px`;
            view.title.style.width = `${(widthOnScreen / step).toFixed(1)}px`;
            view.title.style.setProperty('--driftfield-title-lines', String(t.lines));
            view.titleWidth = widthOnScreen;
          }
          // Keeps a title that is wider than its orb inside the frame at the edges.
          const half = view.titleWidth / 2;
          const centre = half * 2 + 12 >= frame.width ? frame.width / 2 : Math.min(frame.width - half - 6, Math.max(half + 6, orb.x));
          const shift = orb.p.interactive ? Math.round(centre - orb.x) : 0;
          if (shift !== view.titleShift || step !== view.titleStep) {
            view.titleShift = shift;
            view.titleStep = step;
            view.title.style.transform = `translateX(calc(-50% + ${(shift / step).toFixed(1)}px))`;
          }
        }
      }

      for (const [id, view] of views) {
        if (seen.has(id)) continue;
        view.el.remove();
        views.delete(id);
      }

      const nextFloor = frame.floor.toFixed(3);
      if (nextFloor !== floorOpacity) floor.style.opacity = floorOpacity = nextFloor;
      drawLines(frame);
      drawLabels(frame);
    },

    itemIdAt(target: EventTarget | null): string | null {
      const node = target as Element | null;
      if (!node || typeof node.closest !== 'function') return null;
      return node.closest<HTMLElement>('.driftfield-orb')?.dataset.id ?? null;
    },

    destroy(): void {
      views.clear();
      root.remove();
      if (positioned && container.style.position === 'relative') container.style.position = '';
      releaseStyles();
    },
  };
}
