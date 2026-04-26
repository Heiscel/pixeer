import type { TabMeta, TabFilter, AgentMeta, ServerConnection } from './types.js';

// ---- Tab registry ----

export interface TabEntry extends TabMeta {
  conn: ServerConnection;
}

export class TabRegistry {
  private readonly tabs = new Map<string, TabEntry>();

  register(meta: TabMeta, conn: ServerConnection): void {
    this.tabs.set(meta.tabId, { ...meta, conn });
  }

  update(tabId: string, patch: Partial<Pick<TabMeta, 'url' | 'title'>>): TabMeta | undefined {
    const entry = this.tabs.get(tabId);
    if (!entry) return undefined;
    if (patch.url   !== undefined) entry.url   = patch.url;
    if (patch.title !== undefined) entry.title = patch.title;
    const { conn: _conn, ...meta } = entry;
    return meta;
  }

  unregister(tabId: string): TabMeta | undefined {
    const entry = this.tabs.get(tabId);
    if (!entry) return undefined;
    this.tabs.delete(tabId);
    const { conn: _conn, ...meta } = entry;
    return meta;
  }

  get(tabId: string): TabEntry | undefined {
    return this.tabs.get(tabId);
  }

  list(): TabMeta[] {
    return Array.from(this.tabs.values()).map(({ conn: _conn, ...meta }) => meta);
  }

  find(filter: TabFilter): TabMeta | undefined {
    for (const entry of this.tabs.values()) {
      if (matchesTab(entry, filter)) {
        const { conn: _conn, ...meta } = entry;
        return meta;
      }
    }
    return undefined;
  }
}

function matchesTab(tab: TabEntry, filter: TabFilter): boolean {
  if (filter.tabId  !== undefined && tab.tabId  !== filter.tabId)  return false;
  if (filter.origin !== undefined && tab.origin !== filter.origin) return false;
  if (filter.url !== undefined) {
    const ok = filter.url instanceof RegExp ? filter.url.test(tab.url) : tab.url.includes(filter.url);
    if (!ok) return false;
  }
  if (filter.title !== undefined) {
    const ok = filter.title instanceof RegExp ? filter.title.test(tab.title) : tab.title.includes(filter.title);
    if (!ok) return false;
  }
  return true;
}

// ---- Agent registry ----

export interface AgentEntry extends AgentMeta {
  conn: ServerConnection;
}

export class AgentRegistry {
  private readonly agents = new Map<string, AgentEntry>();

  register(meta: AgentMeta, conn: ServerConnection): void {
    this.agents.set(meta.agentId, { ...meta, conn });
  }

  unregister(agentId: string): AgentMeta | undefined {
    const entry = this.agents.get(agentId);
    if (!entry) return undefined;
    this.agents.delete(agentId);
    const { conn: _conn, ...meta } = entry;
    return meta;
  }

  all(): AgentEntry[] {
    return Array.from(this.agents.values());
  }

  list(): AgentMeta[] {
    return this.all().map(({ conn: _conn, ...meta }) => meta);
  }
}
