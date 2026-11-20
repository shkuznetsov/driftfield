# DriftField

A cloud of floating orbs to travel through. DriftField presents an ordered collection of items (articles, products, photos, anything with a title and a picture) as orbs drifting in a dark space. The top of the list is in front. Scrolling or pinching flies the viewer deeper. Items that share a tag are joined by faint elastic lines that light up when an orb is hovered or dragged.

It draws the cloud and nothing else. Your page keeps the data, decides what opening an item means, and owns every control, filter and search box. DriftField has no runtime dependencies and injects its own styles.

> **Status: 0.x.** The interface may still change before 1.0.

## Install

```
npm install driftfield
```

```js
import { create } from 'driftfield';
import { attach } from 'driftfield/bubbles'; // optional
```

Or from a CDN with a plain script tag, which gives the globals `DriftField` and `DriftFieldBubbles`:

```html
<script src="https://cdn.jsdelivr.net/npm/driftfield@0.1/dist/driftfield.iife.js"></script>
<script src="https://cdn.jsdelivr.net/npm/driftfield@0.1/dist/driftfield-bubbles.iife.js"></script>
```

## Quick start

```js
import { create } from 'driftfield';

// Create it straight away. It shows empty space until items arrive.
const cloud = create(document.getElementById('cloud'), {
  loadMore: async ({ after, count }) => {
    const page = await fetchItems({ after, count });   // your code
    return { items: page.items, end: page.isLast };
  },
});

// Hand over the first items whenever they are ready.
cloud.setItems(firstItems, { end: false });

cloud.on('activate', ({ item }) => openItem(item));    // quick click or tap
```

The container needs a size. The cloud fills it and treats its edges as walls. If the container is statically positioned it is made `position: relative` while the cloud lives in it.

### Items

```ts
{ id: string, title: string, image?: string, tags?: string[], ...anything }
```

Only `id`, `title`, `image` and `tags` are read. Everything else passes through untouched and comes back in events. Ids must be unique within a list. A numeric id also works at runtime, and comes back as a string.

### Loading and replacing

The list is strictly ordered and the cloud always starts at the top. As the person travels towards the last delivered item, DriftField calls `loadMore` with the id of the last item it has. Resolve with the next items and `end: true` once there are no more. Only one request is in flight at a time. A rejected request is retried when the person next travels forward.

A filter, a search or any other narrowing is simply a new list. Work out the matching items and call `setItems` again. The cloud starts again from the top. DriftField never filters or searches by itself.

Without `loadMore`, a list handed to `setItems` is treated as complete.

## Interaction

The same model applies to a mouse and a finger.

* **Quick press and release**: fires `activate`. The browser's click that follows is dropped, so it cannot land on whatever you open in response.
* **Hover** (mouse) or **press and hold** (touch): focuses the orb and lights its tag lines. Never activates.
* **Drag**: pulls the orb and, through its tag lines, everything similarly tagged on screen. The orb stays where it is put and drifts home slowly.
* **Wheel, trackpad scroll, pinch**: travel deeper or back. Inside its container the cloud claims these gestures, so the page does not scroll or zoom under it.
* **Keyboard**: orbs are buttons in sequence order. Enter or Space activates.

With `prefers-reduced-motion`, the ambient drift, the pulse and the pop-in are switched off.

## Interface

### `create(container, options?)` returns a `Cloud`

`options` is `loadMore` plus any of the settings below.

| Member | |
|---|---|
| `setItems(items, { end? })` | Replaces the list and returns to the top. `end` defaults to `true` when there is no `loadMore`. |
| `on(type, handler)` | Subscribes to an event. Returns a function that unsubscribes. |
| `configure(changes)` | Changes any settings while running. Invalid values are ignored. |
| `getConfig()` | The settings in use. |
| `setBlur(0..1)` | Depth blur intensity. Shorthand for `configure({ blur })`. |
| `pulse()` | Sends a ripple through the cloud. |
| `travelTo(id)` | Travels to an item that has already been delivered. Unknown ids are ignored. |
| `destroy()` | Removes the cloud, its listeners and, with the last cloud on the page, its styles. |
| `root` | The element the cloud draws into. |

### Events

| Event | Payload | When |
|---|---|---|
| `activate` | `{ item }` | Quick press and release, or Enter. |
| `focus` | `{ item, rect, source }` | An orb is hovered (`source: 'hover'`) or held (`'hold'`). |
| `move` | `{ item, rect }` | The focused orb moved on screen. |
| `blur` | `{ item }` | The orb lost focus. |
| `travel` | `{ position, atFloor }` | Travel position changed, in items from the top. |

`rect` is `{ x, y, width, height }` in pixels relative to the cloud. `focus`, `move` and `blur` are enough to build your own tooltip, or you can use the companion below.

### Bubbles (optional)

```js
import { attach } from 'driftfield/bubbles';

const bubbles = attach(cloud, {
  render: (item, element) => { element.textContent = item.title; },
  gap: 10,
});
// bubbles.detach();
```

The companion creates one empty element with the class `driftfield-bubble`, places it beside the focused orb on whichever side has room (exposed as `data-side`), and hands it to you to fill and style. A bubble is for brief, display-only information. It takes no pointer input, so it can never block an orb, and it closes when the orb loses focus. Anything interactive belongs in your own view, opened on `activate`.

## Settings

All settings are numbers. `DEFAULTS` is exported, and each one is documented in [`src/core/config.ts`](src/core/config.ts).

| Group | Settings and defaults |
|---|---|
| Collection | `windowSize` 20, `floorSize` 5, `linkCap` 3 |
| Press | `holdMs` 250, `dragPx` 6 |
| Depth and look | `depthScale` 0.9, `orbSize` 0.13, `minOrbPx` 24, `blur` 1, `blurDepth` 0.6, `maxDim` 0.75, `depthSpread` 0.25, `titleRatio` 0.085, `titleSize` 17, `titleMinSize` 11, `titleWidth` 1.5, `titleLines` 4, `titleHideScale` 0.38, `labelSize` 12, `popSeconds` 0.5, `popStagger` 0.09, `popOvershoot` 2.4, `flyScale` 5, `flySpread` 1.5 |
| Physics | `homeStiffness` 18, `damping` 5, `linkStiffness` 4, `emphasisStiffness` 28, `gatherRatio` 0.55, `separation` 80, `driftPx` 6, `bounce` 0.45, `pulseSpeed` 600, `returnSeconds` 60 |
| Travel | `wheelPxPerItem` 100, `pinchRate` 3, `glideSeconds` 0.3, `overshoot` 0.6, `snapStiffness` 60 |

### Colours

Set these CSS custom properties on `.driftfield` or any ancestor:

| Property | Default |
|---|---|
| `--driftfield-accent` | `#2f6bff` |
| `--driftfield-bg-inner`, `--driftfield-bg-outer` | `#101a36`, `#03040a` |
| `--driftfield-title-color` | `#fff` |
| `--driftfield-title-bg`, `--driftfield-title-bg-strong` | dark translucent backing behind title lines |
| `--driftfield-title-shadow` | `0 1px 2px rgba(0,0,0,.8)` |

Setting both title backgrounds to `transparent` removes the backing behind title lines, and the shadow then carries the legibility.

## Browser support

Current Chrome, Edge, Firefox and Safari, on desktop and on phones. It needs Pointer Events, `ResizeObserver` and `requestAnimationFrame`. Importing the module touches no browser globals, so it is safe to import during server rendering. Call `create` in the browser only.

## Development

```
npm install
npm test          # unit tests (Vitest, jsdom)
npm run typecheck
npm run build     # writes dist/
```

* **`src/core/`**: the collection layer. Items delivered so far, the active window, travel position, requests for more, tag links. No DOM.
* **`src/graph/`**: the simulation, depth projection, press recogniser, renderer and wiring. `renderer.ts` is the boundary between the simulation and the drawing: `dom-renderer.ts` draws orbs as page elements and the lines on a canvas.
* **`src/overlay/`**: the bubble companion.

## Licence

[MIT](LICENSE)
