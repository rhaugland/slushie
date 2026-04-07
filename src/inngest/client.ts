import { Inngest } from "inngest";
export const inngest = new Inngest({
  id: "slushie-machine",
  isDev: process.env.INNGEST_DEV === "1" || process.env.NODE_ENV !== "production",
});
