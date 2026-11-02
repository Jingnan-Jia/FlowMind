let counter = 0;

export function uid(): string {
  counter = (counter + 1) % 100000;
  return `n${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}
