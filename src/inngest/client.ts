import { Inngest } from "inngest";
export const inngest = new Inngest({
  id: "slushie-machine",
  isDev: process.env.NODE_ENV !== "production",
});
