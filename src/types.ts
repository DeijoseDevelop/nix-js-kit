// =============================================================================
// --- Public types (v0.1 subset) ---
// =============================================================================

/** Route params: `[slug]` -> string, `[...slug]` -> string[]. */
export type RouteParams = Record<string, string | string[]>;

/** Props received by a `page.ts` component's default export. */
export interface PageProps<TData = unknown, TLayout = unknown> {
  /** Return value of the route's `page.data.ts` loader. */
  data: TData;
  /** Return value of the nearest `layout.data.ts` loader, if any. */
  layoutData?: TLayout;
  /** Dynamic segment values. */
  params: RouteParams;
  /** Parsed query string. */
  searchParams: URLSearchParams;
  /** Return value of the last executed action (POST). */
  form?: unknown;
}

/** Props received by a `layout.ts` component's default export. */
export interface LayoutProps<TData = unknown> {
  /** Slot where the child page/layout is rendered. */
  children: unknown;
  /** Return value of this layout's `layout.data.ts`, if any. */
  data?: TData;
}

/** Context passed to a `load` function. */
export interface LoadContext {
  params: RouteParams;
  searchParams: URLSearchParams;
  request?: Request;
}

/** Signature for `page.data.ts` / `layout.data.ts` `load` export. */
export type PageDataLoad<TData = unknown> = (
  ctx: LoadContext,
) => Promise<TData> | TData;
