export function splitListValues(input: string): string[] {
  return input
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function appendUniqueListValues(current: string[], rawInput: string): string[] {
  const incoming = splitListValues(rawInput);
  if (incoming.length === 0) return current;

  const set = new Set(current);
  let changed = false;

  for (const value of incoming) {
    if (!set.has(value)) {
      set.add(value);
      changed = true;
    }
  }

  return changed ? Array.from(set) : current;
}

export async function copyListValues(values: string[]): Promise<void> {
  if (values.length === 0) return;

  try {
    await navigator.clipboard.writeText(values.join(', '));
  } catch {
    return;
  }
}
