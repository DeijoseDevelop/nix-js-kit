// =============================================================================
// --- Public types (v0.1 subset) ---
// =============================================================================

/** Route params: `[slug]` -> string, `[...slug]` -> string[]. */
export type RouteParams = Record<string, string | string[]>;

/** Infer the data type from a loader type, supporting both plain types and functions. */
type InferLoaderData<T> = T extends (...args: any[]) => infer R ? Awaited<R> : T;

/** Props received by a `page.ts` component's default export. */
export type PageProps<TData = unknown, TLayout = unknown> = {
  /** Return value of the route's `page.data.ts` loader. */
  data: InferLoaderData<TData>;
  /** Return value of the nearest `layout.data.ts` loader, if any. */
  layoutData?: InferLoaderData<TLayout>;
  /** Dynamic segment values. */
  params: RouteParams;
  /** Parsed query string. */
  searchParams: URLSearchParams;
  /** Return value of the last executed action (POST). */
  form?: unknown;
};

/** Props received by a `layout.ts` component's default export. */
export type LayoutProps<TData = unknown> = {
  /** Slot where the child page/layout is rendered. */
  children: unknown;
  /** Return value of this layout's `layout.data.ts`, if any. */
  data?: InferLoaderData<TData>;
};

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

/** Signature for `generateStaticParams` in dynamic page modules. */
export type GenerateStaticParams = () =>
  | Promise<RouteParams[]>
  | RouteParams[];
