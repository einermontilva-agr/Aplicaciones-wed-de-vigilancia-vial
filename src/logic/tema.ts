export type TemaModo = 'claro' | 'oscuro' | 'auto';

const STORAGE_KEY_TEMA = 'vigia_santa_marta_tema_v1';

export function cargarTemaPreferido(): TemaModo {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_TEMA);
    if (raw === 'claro' || raw === 'oscuro' || raw === 'auto') {
      return raw;
    }
    return 'auto';
  } catch {
    return 'auto';
  }
}

export function guardarTemaPreferido(modo: TemaModo): void {
  try {
    window.localStorage.setItem(STORAGE_KEY_TEMA, modo);
  } catch {
    // Ignorar error de almacenamiento
  }
}

export function resolverEsOscuro(modo: TemaModo): boolean {
  if (modo === 'oscuro') return true;
  if (modo === 'claro') return false;
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  return false;
}

export function aplicarTemaAlDocumento(modo: TemaModo): boolean {
  const esOscuro = resolverEsOscuro(modo);
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', esOscuro);
    document.documentElement.style.colorScheme = esOscuro ? 'dark' : 'light';
  }
  return esOscuro;
}
