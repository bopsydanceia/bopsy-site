// Vitest: the tests read the English texts, whatever the machine's language.
// Runs before each test file imports the app (src/locale.ts reads it at load).
try {
  localStorage.setItem('bopsy.lang', 'en');
} catch {
  // No storage: navigator.languages of jsdom is en-US anyway.
}
