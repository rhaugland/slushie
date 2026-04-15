import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import Stripe from "stripe";

// Stripe sends raw body — disable Next.js body parsing
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET not configured" }, { status: 503 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId =
          typeof invoice.subscription === "string"
            ? invoice.subscription
            : invoice.subscription?.id;

        if (!subscriptionId) break;

        const billing = await prisma.billing.findFirst({
          where: { stripeSubscriptionId: subscriptionId },
        });
        if (!billing) break;

        const newMonthsPaid = billing.monthsPaid + 1;
        const isComplete = newMonthsPaid >= billing.totalMonths;

        await prisma.billing.update({
          where: { id: billing.id },
          data: {
            monthsPaid: newMonthsPaid,
            status: isComplete ? "complete" : billing.status,
          },
        });

        console.log(
          `[billing] Invoice paid for project ${billing.projectId}: ${newMonthsPaid}/${billing.totalMonths}${isComplete ? " (complete)" : ""}`
        );
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId =
          typeof invoice.subscription === "string"
            ? invoice.subscription
            : invoice.subscription?.id;

        if (!subscriptionId) break;

        const billing = await prisma.billing.findFirst({
          where: { stripeSubscriptionId: subscriptionId },
        });
        if (!billing) break;

        // Don't change status — Stripe will retry. Just log it.
        console.warn(
          `[billing] Payment failed for project ${billing.projectId} (attempt ${invoice.attempt_count})`
        );
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;

        const billing = await prisma.billing.findFirst({
          where: { stripeSubscriptionId: subscription.id },
        });
        if (!billing) break;

        // Only mark cancelled if not already complete
        if (billing.status !== "complete") {
          await prisma.billing.update({
            where: { id: billing.id },
            data: { status: "cancelled" },
          });
          console.log(`[billing] Subscription cancelled for project ${billing.projectId}`);
        }
        break;
      }

      default:
        // Unhandled event type — that's fine
        break;
    }
  } catch (err: any) {
    console.error(`[billing] Error handling ${event.type}:`, err.message);
    return NextResponse.json({ error: "Webhook handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
