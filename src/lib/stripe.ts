import Stripe from "stripe";

const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!stripeKey) {
  console.warn("STRIPE_SECRET_KEY not set — billing features will be unavailable");
}

export const stripe = stripeKey
  ? new Stripe(stripeKey, { apiVersion: "2026-03-25.dahlia" as any })
  : null;
