export function sanitizeName(name: string): string {
  // Allow alphanumeric, hyphens, underscores, spaces — no path traversal
  return name.replace(/[^a-zA-Z0-9_ -]/g, '-').slice(0, 100)
}
