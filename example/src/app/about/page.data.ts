import type { PageDataLoad } from "../../../../src/index.ts";

export interface AboutData {
  title: string;
  mission: string;
}

export const load: PageDataLoad<AboutData> = async () => {
  return {
    title: "About Nix Kit",
    mission: "A full-stack meta-framework for Nix.js with zero virtual DOM.",
  };
};
