import type { PageDataLoad } from "../../../../../../src/index.ts";

export const load: PageDataLoad<{ title: string }> = async ({ params }) => {
  return { title: `Post: ${params.slug}` };
};
