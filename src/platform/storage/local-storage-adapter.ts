export class LocalStorageAdapter<T> {
  private key: string;
  private listeners: Set<() => void> = new Set();
  
  constructor(key: string) {
    this.key = key;
  }

  private isBrowser(): boolean {
    return typeof window !== 'undefined';
  }

  public getItems(): T[] {
    if (!this.isBrowser()) return [];
    try {
      const data = window.localStorage.getItem(this.key);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  public saveItems(items: T[]): void {
    if (!this.isBrowser()) return;
    window.localStorage.setItem(this.key, JSON.stringify(items));
    this.notify();
  }

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    
    const handleStorage = (e: StorageEvent) => {
      if (e.key === this.key) {
        listener();
      }
    };
    if (this.isBrowser()) {
       window.addEventListener('storage', handleStorage);
    }
    
    return () => {
      this.listeners.delete(listener);
      if (this.isBrowser()) {
         window.removeEventListener('storage', handleStorage);
      }
    };
  }

  public notify(): void {
    this.listeners.forEach(listener => listener());
  }
}
