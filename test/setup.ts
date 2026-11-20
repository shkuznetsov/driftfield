// jsdom has no canvas. The cloud draws its lines on one and copes without it,
// but jsdom reports every attempt as an error, which buries real output.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
}
