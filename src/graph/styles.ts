/** Size in pixels of the unscaled orb box. Orbs are sized by scaling this box. */
export const ORB_BOX = 200;

export const STYLE_ID = 'driftfield-styles';

export const STYLES = `
.driftfield {
  position: absolute; inset: 0; overflow: hidden;
  touch-action: none; user-select: none; -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
  --driftfield-accent: #2f6bff;
  --driftfield-bg-inner: #101a36;
  --driftfield-bg-outer: #03040a;
  --driftfield-title-color: #fff;
  --driftfield-title-bg: rgba(3,4,10,.66);
  --driftfield-title-bg-strong: rgba(8,16,44,.92);
  --driftfield-title-shadow: 0 1px 2px rgba(0,0,0,.8);
}
.driftfield-backdrop {
  position: absolute; inset: 0;
  background: radial-gradient(ellipse at 50% 42%, var(--driftfield-bg-inner) 0%, var(--driftfield-bg-outer) 78%);
}
.driftfield-floor { position: absolute; inset: 0; opacity: 0; pointer-events: none; overflow: hidden; }
.driftfield-floor::before {
  content: ''; position: absolute; left: -50%; right: -50%; bottom: -12%; height: 62%;
  background:
    repeating-linear-gradient(90deg, rgba(90,140,255,.55) 0 1px, transparent 1px 64px),
    repeating-linear-gradient(0deg, rgba(90,140,255,.55) 0 1px, transparent 1px 64px);
  transform: perspective(520px) rotateX(64deg); transform-origin: 50% 100%;
  -webkit-mask-image: linear-gradient(to top, #000 10%, transparent 92%);
  mask-image: linear-gradient(to top, #000 10%, transparent 92%);
}
.driftfield-floor::after {
  content: ''; position: absolute; inset: 0;
  background: radial-gradient(ellipse at 50% 108%, rgba(60,120,255,.5) 0%, rgba(40,80,220,.16) 38%, transparent 68%);
}
.driftfield-lines { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.driftfield-orbs { position: absolute; inset: 0; isolation: isolate; pointer-events: none; }
.driftfield-orb {
  position: absolute; left: 0; top: 0; width: ${ORB_BOX}px; height: ${ORB_BOX}px;
  margin: 0; padding: 0; border: 0; border-radius: 50%; overflow: visible;
  background: none; color: var(--driftfield-title-color); font: inherit; cursor: pointer; pointer-events: auto;
  transform-origin: 50% 50%;
  box-shadow: 0 0 0 1px rgba(190,210,255,.28), 0 0 22px rgba(90,130,255,.18), 0 14px 40px rgba(0,0,0,.5);
  transition: box-shadow .18s ease;
  -webkit-appearance: none; appearance: none; outline: none;
}
.driftfield-orb:focus-visible { box-shadow: 0 0 0 4px #fff, 0 0 0 8px var(--driftfield-accent); }
.driftfield-orb.is-lit {
  box-shadow: 0 0 0 3px var(--driftfield-accent), 0 0 36px 4px var(--driftfield-accent), 0 14px 40px rgba(0,0,0,.5);
}
.driftfield-orb.is-focused {
  box-shadow: 0 0 0 3px #9db9ff, 0 0 44px 8px var(--driftfield-accent), 0 14px 40px rgba(0,0,0,.5);
}
.driftfield-orb.is-dragging { cursor: grabbing; }
/* The round picture. The title is a sibling, so it can overflow the circle. */
.driftfield-disc {
  position: absolute; inset: 0; border-radius: 50%; overflow: hidden; pointer-events: none;
  background: linear-gradient(140deg, #33406b, #151c33);
}
.driftfield-img {
  position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
  pointer-events: none; -webkit-user-drag: none;
}
.driftfield-img-blur { filter: blur(9px); transform: scale(1.12); opacity: 0; }
/* Darkens the bottom of the picture, where the title begins. */
.driftfield-band {
  position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(to bottom, transparent 48%, rgba(3,4,10,.5) 66%, rgba(3,4,10,.86) 80%, rgba(3,4,10,.92) 100%);
}
.driftfield-shade { position: absolute; inset: 0; background: #03040a; opacity: 0; pointer-events: none; }
.driftfield-rim {
  position: absolute; inset: 0; border-radius: 50%; pointer-events: none;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.22), inset 0 10px 24px rgba(255,255,255,.12);
}
/*
  The title starts in the darkened bottom quarter of the orb and runs on below
  it when it is long. Each line carries its own dark backing, so it reads over
  any picture, any neighbouring orb and the backdrop alike.
*/
.driftfield-title {
  position: absolute; left: 50%; top: 73%; transform: translateX(-50%);
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: var(--driftfield-title-lines, 4); overflow: hidden;
  padding: 0 .4em .2em; box-sizing: border-box; pointer-events: none;
  text-align: center; text-wrap: balance; overflow-wrap: anywhere;
  font-weight: 700; line-height: 1.42; letter-spacing: .005em;
}
.driftfield-title > span {
  padding: .12em .42em; border-radius: .3em;
  background: var(--driftfield-title-bg);
  -webkit-box-decoration-break: clone; box-decoration-break: clone;
  text-shadow: var(--driftfield-title-shadow);
}
.driftfield-orb.is-focused .driftfield-title > span, .driftfield-orb.is-lit .driftfield-title > span {
  background: var(--driftfield-title-bg-strong);
}
`;
