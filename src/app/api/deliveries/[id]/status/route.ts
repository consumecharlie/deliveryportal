import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/deliveries/[id]/status
 *
 * Check n8n execution status for a delivery.
 * Polls the n8n API for the execution's current state and updates
 * the portal's delivery record accordingly.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    // Fetch the delivery record to get the n8n execution ID
    let delivery;
    try {
      delivery = await prisma.delivery.findUnique({
        where: { id },
        select: {
          id: true,
          n8nExecutionId: true,
          n8nStatus: true,
          sentAt: true,
        },
      });
    } catch {
      // DB not connected — return unknown status
      return NextResponse.json({
        status: "unknown",
        message: "Database not connected — cannot retrieve delivery status",
      });
    }

    if (!delivery) {
      return NextResponse.json(
        { error: "Delivery not found" },
        { status: 404 }
      );
    }

    // If we already have a terminal status, return it directly
    if (
      delivery.n8nStatus === "success" ||
      delivery.n8nStatus === "error"
    ) {
      return NextResponse.json({
        deliveryId: delivery.id,
        status: delivery.n8nStatus,
        executionId: delivery.n8nExecutionId,
      });
    }

    // If no execution ID was recorded, we can't poll n8n
    if (!delivery.n8nExecutionId) {
      return NextResponse.json({
        deliveryId: delivery.id,
        status: delivery.n8nStatus ?? "pending",
        executionId: null,
        message: "No n8n execution ID recorded for this delivery",
      });
    }

    // Poll the n8n API for execution status
    const n8nApiUrl = process.env.N8N_API_URL;
    const n8nApiKey = process.env.N8N_API_KEY;

    if (!n8nApiUrl || !n8nApiKey) {
      return NextResponse.json({
        deliveryId: delivery.id,
        status: delivery.n8nStatus ?? "pending",
        executionId: delivery.n8nExecutionId,
        message: "n8n API credentials not configured — cannot poll execution status",
      });
    }

    const n8nRes = await fetch(
      `${n8nApiUrl}/executions/${delivery.n8nExecutionId}`,
      {
        headers: {
          "X-N8N-API-KEY": n8nApiKey,
          Accept: "application/json",
        },
      }
    );

    if (!n8nRes.ok) {
      const errText = await n8nRes.text().catch(() => "");
      console.error(
        `n8n execution status fetch failed: ${n8nRes.status} ${errText}`
      );
      return NextResponse.json({
        deliveryId: delivery.id,
        status: delivery.n8nStatus ?? "pending",
        executionId: delivery.n8nExecutionId,
        message: `Failed to fetch n8n execution status: ${n8nRes.status}`,
      });
    }

    const execution = (await n8nRes.json()) as {
      id: string;
      finished: boolean;
      status?: string;
      stoppedAt?: string;
      data?: {
        resultData?: {
          error?: { message?: string };
        };
      };
    };

    // Map n8n execution status to our status
    let resolvedStatus: string;
    let errorMessage: string | undefined;

    if (!execution.finished) {
      resolvedStatus = "running";
    } else if (execution.status === "success" || (execution.finished && !execution.data?.resultData?.error)) {
      resolvedStatus = "success";
    } else {
      resolvedStatus = "error";
      errorMessage =
        execution.data?.resultData?.error?.message ?? "Execution failed";
    }

    // Update the delivery record with the latest status
    if (resolvedStatus === "success" || resolvedStatus === "error") {
      try {
        await prisma.delivery.update({
          where: { id },
          data: { n8nStatus: resolvedStatus },
        });
      } catch {
        console.warn("Failed to update delivery n8n status in DB");
      }
    }

    return NextResponse.json({
      deliveryId: delivery.id,
      status: resolvedStatus,
      executionId: delivery.n8nExecutionId,
      ...(errorMessage && { error: errorMessage }),
    });
  } catch (error) {
    console.error("Failed to check delivery status:", error);
    return NextResponse.json(
      { error: "Failed to check delivery status" },
      { status: 500 }
    );
  }
}
