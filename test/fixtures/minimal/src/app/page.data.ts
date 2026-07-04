import type { PageDataLoad } from "../../../../../src/index.ts";

export interface HomeData {
  title: string;
}

export const load: PageDataLoad<HomeData> = async () => {
  return { title: "Hello from test" };
};

export const revalidate = 60;
