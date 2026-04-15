import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { stripe } from "@/lib/stripe";

// GET /api/billing?projectId=xxx — get billing status + invoices
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const billing = await prisma.billing.findUnique({ where: { projectId } });
  if (!billing) return NextResponse.json({ billing: null, invoices: [] });

  // Fetch invoices from Stripe
  let invoices: any[] = [];
  if (stripe && billing.stripeCustomerId) {
    try {
      const stripeInvoices = await stripe.invoices.list({
        customer: billing.stripeCustomerId,
        limit: 100,
      });
      invoices = stripeInvoices.data.map((inv) => ({
        id: inv.id,
        number: inv.number,
        amount: inv.amount_due,
        status: inv.status,
        dueDate: inv.due_date ? new Date(inv.due_date * 1000).toISOString() : null,
        paidAt: inv.status_transitions?.paid_at
          ? new Date(inv.status_transitions.paid_at * 1000).toISOString()
          : null,
        hostedUrl: inv.hosted_invoice_url,
        created: new Date(inv.created * 1000).toISOString(),
      }));
    } catch {
      // Stripe may not be configured
    }
  }

  return NextResponse.json({
    billing: {
      id: billing.id,
      status: billing.status,
      clientEmail: billing.clientEmail,
      monthlyAmount: billing.monthlyAmount,
      totalMonths: billing.totalMonths,
      monthsPaid: billing.monthsPaid,
      startedAt: billing.startedAt,
      pausedAt: billing.pausedAt,
    },
    invoices,
  });
}

// POST /api/billing — start billing
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured. Add STRIPE_SECRET_KEY to .env" }, { status: 503 });
  }

  const { projectId, clientEmail, monthlyAmount, totalMonths } = await req.json();
  if (!projectId || !clientEmail || !monthlyAmount || !totalMonths) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Check if billing already exists
  const existing = await prisma.billing.findUnique({ where: { projectId } });
  if (existing?.stripeSubscriptionId) {
    return NextResponse.json({ error: "Billing already active for this project" }, { status: 409 });
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { client: true },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // Create or find Stripe customer
  const customers = await stripe.customers.list({ email: clientEmail, limit: 1 });
  let customer = customers.data[0];
  if (!customer) {
    customer = await stripe.customers.create({
      email: clientEmail,
      name: project.client?.name || clientEmail,
      metadata: { projectId, projectName: project.name },
    });
  }

  // Create a price for this retainer
  const price = await stripe.prices.create({
    currency: "usd",
    unit_amount: monthlyAmount, // in cents
    recurring: { interval: "month" },
    product_data: {
      name: `${project.name} — Monthly Retainer`,
      metadata: { projectId },
    },
  });

  // Create subscription
  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: price.id }],
    collection_method: "send_invoice",
    days_until_due: 7,
    cancel_at_period_end: false,
    metadata: { projectId, totalMonths: String(totalMonths) },
  });

  // Schedule cancellation after N months
  const cancelAt = new Date();
  cancelAt.setMonth(cancelAt.getMonth() + totalMonths);
  await stripe.subscriptions.update(subscription.id, {
    cancel_at: Math.floor(cancelAt.getTime() / 1000),
  });

  // Upsert billing record
  const billing = await prisma.billing.upsert({
    where: { projectId },
    create: {
      projectId,
      clientEmail,
      monthlyAmount,
      totalMonths,
      status: "active",
      stripeCustomerId: customer.id,
      stripeSubscriptionId: subscription.id,
      stripePriceId: price.id,
      startedAt: new Date(),
    },
    update: {
      clientEmail,
      monthlyAmount,
      totalMonths,
      status: "active",
      stripeCustomerId: customer.id,
      stripeSubscriptionId: subscription.id,
      stripePriceId: price.id,
      startedAt: new Date(),
      pausedAt: null,
    },
  });

  return NextResponse.json({ billing, subscriptionId: subscription.id });
}

// PATCH /api/billing — pause/resume/cancel
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const { projectId, action } = await req.json();
  if (!projectId || !action) {
    return NextResponse.json({ error: "projectId and action required" }, { status: 400 });
  }

  const billing = await prisma.billing.findUnique({ where: { projectId } });
  if (!billing || !billing.stripeSubscriptionId) {
    return NextResponse.json({ error: "No active billing found" }, { status: 404 });
  }

  if (action === "pause") {
    await stripe.subscriptions.update(billing.stripeSubscriptionId, {
      pause_collection: { behavior: "void" },
    });
    await prisma.billing.update({
      where: { projectId },
      data: { status: "paused", pausedAt: new Date() },
    });
  } else if (action === "resume") {
    await stripe.subscriptions.update(billing.stripeSubscriptionId, {
      pause_collection: "",
    });
    await prisma.billing.update({
      where: { projectId },
      data: { status: "active", pausedAt: null },
    });
  } else if (action === "cancel") {
    await stripe.subscriptions.cancel(billing.stripeSubscriptionId);
    await prisma.billing.update({
      where: { projectId },
      data: { status: "cancelled" },
    });
  } else {
    return NextResponse.json({ error: "Invalid action. Use: pause, resume, cancel" }, { status: 400 });
  }

  const updated = await prisma.billing.findUnique({ where: { projectId } });
  return NextResponse.json({ billing: updated });
}
