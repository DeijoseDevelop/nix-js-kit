import type { PageDataLoad, LoadContext } from "@deijose/nix-js-kit";

export interface PostData {
  title: string;
  body: string;
}

export const load: PageDataLoad<PostData> = async (ctx: LoadContext) => {
  const slug = ctx.params.slug;
  return {
    title: `Post: ${slug}`,
    body: `Contenido del artículo "${slug}" generado en build-time.`,
  };
};
